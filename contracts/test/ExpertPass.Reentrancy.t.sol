// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";
import {MaliciousHolder} from "./MockUSDC.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ExpertPassReentrancyTest is ExpertPassTestBase {
    MaliciousHolder internal mal;

    function setUp() public override {
        super.setUp();
        mal = new MaliciousHolder(pass, usdc);
        usdc.mint(address(mal), 1_000e6);
    }

    function _assertBlocked() internal view {
        assertTrue(mal.reentryAttempted(), "callback not reached");
        assertFalse(mal.reentrySucceeded(), "reentry succeeded");
        assertEq(bytes4(mal.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    function test_Reentrancy_ContractBuyerWithoutAttackWorks() public {
        uint256 id = _create(PRICE, 5, false);
        mal.buy(id, PRICE);
        assertEq(pass.balanceOf(address(mal), id), 1);
        assertFalse(mal.reentryAttempted());
    }

    function test_Reentrancy_BuyTicketCallbackCannotBuyAgain() public {
        uint256 a = _create(PRICE, 5, false);
        uint256 b = _create(PRICE, 5, false);
        mal.arm(MaliciousHolder.Mode.BuyOnReceive, b);
        // the attacker approves enough for both purchases so only the guard can stop it
        vm.prank(address(mal));
        usdc.approve(address(pass), type(uint256).max);
        vm.prank(address(mal));
        pass.buyTicket(a);

        _assertBlocked();
        assertEq(pass.balanceOf(address(mal), a), 1);
        assertEq(pass.balanceOf(address(mal), b), 0);
        assertEq(pass.getSession(b).sold, 0);
        assertEq(usdc.balanceOf(address(pass)), PRICE);
    }

    function test_Reentrancy_BuyTicketCallbackCannotBuySameSessionTwice() public {
        uint256 a = _create(PRICE, 5, false);
        mal.arm(MaliciousHolder.Mode.BuyOnReceive, a);
        vm.prank(address(mal));
        usdc.approve(address(pass), type(uint256).max);
        vm.prank(address(mal));
        pass.buyTicket(a);
        _assertBlocked();
        assertEq(pass.balanceOf(address(mal), a), 1);
        assertEq(pass.getSession(a).sold, 1);
    }

    function test_Reentrancy_BuyTicketCallbackCannotRefund() public {
        uint256 a = _create(PRICE, 5, false);
        uint256 b = _create(PRICE, 50, false);
        // 40 fillers fill the auto-refund window; mal (41st) stays un-refunded after cancel
        _buyMany(b, 0, 40, PRICE);
        mal.buy(b, PRICE);
        vm.prank(expert);
        pass.cancelSession(b);
        assertEq(pass.balanceOf(address(mal), b), 1);

        mal.arm(MaliciousHolder.Mode.RefundOnReceive, b);
        mal.buy(a, PRICE);

        _assertBlocked();
        assertEq(pass.balanceOf(address(mal), b), 1, "ticket must not be refunded via reentry");
        assertEq(usdc.balanceOf(address(pass)), 2 * uint256(PRICE));
    }

    function test_Reentrancy_RefundUsdcHookCannotRefundTwice() public {
        // attacker ends with two tickets for a cancelled transferable session
        uint256 b = _create(PRICE, 50, true);
        _buyMany(b, 0, 40, PRICE); // fill the auto-refund window so mal is not auto-refunded
        mal.buy(b, PRICE);
        _fundAndBuy(alice, b);
        vm.prank(alice);
        pass.safeTransferFrom(alice, address(mal), b, 1, "");
        assertEq(pass.balanceOf(address(mal), b), 2);
        vm.prank(expert);
        pass.cancelSession(b);

        mal.arm(MaliciousHolder.Mode.RefundOnUSDC, b);
        usdc.setHook(address(mal));
        uint256 before = usdc.balanceOf(address(mal));
        mal.doRefund(b);

        _assertBlocked();
        assertEq(usdc.balanceOf(address(mal)) - before, PRICE, "exactly one refund");
        assertEq(pass.balanceOf(address(mal), b), 1);
        assertEq(usdc.balanceOf(address(pass)), PRICE); // second ticket's escrow intact
    }

    function test_Reentrancy_MintCertificateCallbackCannotReenter() public {
        uint256 id = _create(PRICE, 5, false);
        mal.buy(id, PRICE);
        mal.arm(MaliciousHolder.Mode.MintCertsOnReceive, id);
        _toEnd();
        address[] memory r = new address[](1);
        r[0] = address(mal);
        vm.prank(expert);
        pass.mintCertificates(id, r);

        _assertBlocked();
        assertEq(pass.balanceOf(address(mal), pass.certificateId(id)), 1);
    }
}
