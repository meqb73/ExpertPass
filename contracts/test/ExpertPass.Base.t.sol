// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ExpertPass} from "../ExpertPass.sol";
import {MockUSDC} from "./MockUSDC.sol";

abstract contract ExpertPassTestBase is Test {
    ExpertPass internal pass;
    MockUSDC internal usdc;

    address internal owner = makeAddr("owner");
    address internal expert = makeAddr("expert");
    address internal expert2 = makeAddr("expert2");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal treasury = makeAddr("treasury");

    uint256 internal constant T0 = 1_700_000_000;
    uint64 internal constant START = uint64(T0 + 1 days);
    uint32 internal constant DUR = 2 hours;
    uint128 internal constant PRICE = 10e6;
    uint16 internal constant FEE = 250; // 2.5%
    string internal constant LINK = "https://example.com/session";

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockUSDC();
        pass = new ExpertPass(address(usdc), owner, FEE);
        vm.prank(expert);
        pass.registerExpert("Expert One", "Bio");
        vm.prank(expert2);
        pass.registerExpert("Expert Two", "");
    }

    function _create(uint128 price, uint32 supply, bool transferable) internal returns (uint256 id) {
        vm.prank(expert);
        id = pass.createSession("Title", "Desc", 0, price, supply, START, DUR, transferable, LINK, "");
    }

    function _fund(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.prank(user);
        usdc.approve(address(pass), type(uint256).max);
    }

    function _buy(address user, uint256 id) internal {
        vm.prank(user);
        pass.buyTicket(id);
    }

    function _fundAndBuy(address user, uint256 id) internal {
        _fund(user, 1_000_000e6);
        _buy(user, id);
    }

    /// @dev Deterministic EOA address for the i-th synthetic buyer.
    function _buyer(uint256 i) internal pure returns (address) {
        return address(uint160(0x100000 + i));
    }

    /// @dev Buyers [from, from + n) each buy one ticket; each is funded with exactly `fundEach`.
    function _buyMany(uint256 id, uint256 from, uint256 n, uint256 fundEach) internal {
        for (uint256 i = from; i < from + n; ++i) {
            address b = _buyer(i);
            usdc.mint(b, fundEach);
            vm.prank(b);
            usdc.approve(address(pass), type(uint256).max);
            vm.prank(b);
            pass.buyTicket(id);
        }
    }

    function _cancel(uint256 id) internal {
        vm.prank(expert);
        pass.cancelSession(id);
    }

    function _endTime() internal pure returns (uint256) {
        return uint256(START) + DUR;
    }

    function _toEnd() internal {
        vm.warp(_endTime());
    }
}
