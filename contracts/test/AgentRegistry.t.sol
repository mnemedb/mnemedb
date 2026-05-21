// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry reg;
    address alice = address(0xA11CE);
    address bob   = address(0xB0B);

    event AgentRegistered(address indexed wallet, bytes32 indexed namespace, string handle);

    function setUp() public {
        reg = new AgentRegistry();
    }

    function test_register_assignsMappingsAndEmits() public {
        bytes32 expected = _pack("alice");

        vm.expectEmit(true, true, false, true);
        emit AgentRegistered(alice, expected, "alice");

        vm.prank(alice);
        reg.register("alice");

        assertEq(reg.namespaceOf(alice), expected);
        assertEq(reg.walletOf(expected), alice);
    }

    function test_revertsWhen_handleTaken() public {
        vm.prank(alice);
        reg.register("alice");
        vm.prank(bob);
        vm.expectRevert(AgentRegistry.NamespaceTaken.selector);
        reg.register("alice");
    }

    function test_revertsWhen_walletReregisters() public {
        vm.prank(alice);
        reg.register("alice");
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.WalletAlreadyRegistered.selector);
        reg.register("alice2");
    }

    function test_revertsWhen_handleUppercase() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.InvalidHandle.selector);
        reg.register("Alice");
    }

    function test_revertsWhen_handleTooShort() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.InvalidHandle.selector);
        reg.register("ab");
    }

    function test_revertsWhen_handleHasDash() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.InvalidHandle.selector);
        reg.register("ali-ce");
    }

    function test_transfer_movesOwnership() public {
        vm.prank(alice);
        reg.register("alice");
        vm.prank(alice);
        reg.transfer(bob);

        bytes32 ns = _pack("alice");
        assertEq(reg.walletOf(ns), bob);
        assertEq(reg.namespaceOf(alice), bytes32(0));
        assertEq(reg.namespaceOf(bob), ns);
    }

    function test_revertsWhen_transferToExistingOwner() public {
        vm.prank(alice);
        reg.register("alice");
        vm.prank(bob);
        reg.register("bob");
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.WalletAlreadyRegistered.selector);
        reg.transfer(bob);
    }

    function _pack(string memory s) internal pure returns (bytes32 r) {
        bytes memory b = bytes(s);
        assembly { r := mload(add(b, 32)) }
    }
}
