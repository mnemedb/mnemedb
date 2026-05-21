// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  AgentRegistry
/// @notice Maps an agent wallet to a chosen namespace handle. The Mneme gateway
///         watches AgentRegistered events to provision a per-agent Postgres
///         schema. Handles are lowercase ASCII [a-z0-9_], 3–32 chars, packed
///         into bytes32. One namespace per wallet; one wallet per namespace.
contract AgentRegistry {
    mapping(address => bytes32) public namespaceOf;
    mapping(bytes32 => address) public walletOf;

    event AgentRegistered(address indexed wallet, bytes32 indexed namespace, string handle);
    event AgentTransferred(bytes32 indexed namespace, address indexed from, address indexed to);

    error NamespaceTaken();
    error WalletAlreadyRegistered();
    error InvalidHandle();
    error NotOwner();

    function register(string calldata handle) external {
        if (namespaceOf[msg.sender] != bytes32(0)) revert WalletAlreadyRegistered();
        bytes32 ns = _validateAndPack(handle);
        if (walletOf[ns] != address(0)) revert NamespaceTaken();

        namespaceOf[msg.sender] = ns;
        walletOf[ns] = msg.sender;
        emit AgentRegistered(msg.sender, ns, handle);
    }

    function transfer(address to) external {
        bytes32 ns = namespaceOf[msg.sender];
        if (ns == bytes32(0)) revert NotOwner();
        if (namespaceOf[to] != bytes32(0)) revert WalletAlreadyRegistered();

        delete namespaceOf[msg.sender];
        namespaceOf[to] = ns;
        walletOf[ns] = to;
        emit AgentTransferred(ns, msg.sender, to);
    }

    function _validateAndPack(string calldata handle) internal pure returns (bytes32 packed) {
        bytes memory b = bytes(handle);
        uint256 len = b.length;
        if (len < 3 || len > 32) revert InvalidHandle();
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool ok =
                (c >= 0x61 && c <= 0x7a) || // a-z
                (c >= 0x30 && c <= 0x39) || // 0-9
                 c == 0x5f;                 // _
            if (!ok) revert InvalidHandle();
        }
        assembly { packed := mload(add(b, 32)) }
    }
}
