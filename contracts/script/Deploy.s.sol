// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

contract DeployRegistry is Script {
    function run() external returns (AgentRegistry reg) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(pk);
        reg = new AgentRegistry();
        vm.stopBroadcast();
        console2.log("AgentRegistry deployed at:", address(reg));
    }
}
