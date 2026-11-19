// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ExpertPassPayoutTest is ExpertPassTestBase {
    event ProceedsWithdrawn(uint256 indexed id, address indexed expert, uint256 net, uint256 fee);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event FeeBpsUpdated(uint16 previousFeeBps, uint16 newFeeBps);

    function _sellThree(uint256 id) internal {
        _fundAndBuy(alice, id);
        _fundAndBuy(bob, id);
        _fundAndBuy(carol, id);
    }

    // ---------- withdrawProceeds ----------

    function test_WithdrawProceeds_AfterEnd_PaysNetAndAccruesFee() public {
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        _toEnd();
        uint256 gross = 3 * uint256(PRICE);
        uint256 fee = gross * FEE / 10000;
        vm.expectEmit(true, true, false, true, address(pass));
        emit ProceedsWithdrawn(id, expert, gross - fee, fee);
        vm.prank(expert);
        pass.withdrawProceeds(id);
        assertEq(fee, 750_000);
        assertEq(usdc.balanceOf(expert), gross - fee);
        assertEq(pass.accruedFees(), fee);
        assertEq(usdc.balanceOf(address(pass)), fee);
        assertTrue(pass.getSession(id).paidOut);
    }

    function test_WithdrawProceeds_RevertsBeforeEnd() public {
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        vm.startPrank(expert);
        vm.expectRevert(ExpertPass.SessionNotEnded.selector);
        pass.withdrawProceeds(id);
        vm.warp(START); // started but not ended
        vm.expectRevert(ExpertPass.SessionNotEnded.selector);
        pass.withdrawProceeds(id);
        vm.warp(_endTime() - 1);
        vm.expectRevert(ExpertPass.SessionNotEnded.selector);
        pass.withdrawProceeds(id);
        vm.warp(_endTime());
        pass.withdrawProceeds(id);
        vm.stopPrank();
    }

    function test_WithdrawProceeds_RevertsNotExpert() public {
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        _toEnd();
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NotSessionExpert.selector);
        pass.withdrawProceeds(id);
        vm.prank(owner);
        vm.expectRevert(ExpertPass.NotSessionExpert.selector);
        pass.withdrawProceeds(id);
    }

    function test_WithdrawProceeds_RevertsDoubleWithdraw() public {
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        _toEnd();
        vm.startPrank(expert);
        pass.withdrawProceeds(id);
        vm.expectRevert(ExpertPass.SessionAlreadyPaidOut.selector);
        pass.withdrawProceeds(id);
        vm.stopPrank();
    }

    function test_WithdrawProceeds_RevertsWhenCancelled() public {
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        vm.startPrank(expert);
        pass.cancelSession(id);
        vm.warp(_endTime());
        vm.expectRevert(ExpertPass.SessionCancelled.selector);
        pass.withdrawProceeds(id);
        vm.stopPrank();
    }

    function test_WithdrawProceeds_UnknownSession() public {
        vm.prank(expert);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 9));
        pass.withdrawProceeds(9);
    }

    function test_WithdrawProceeds_NoSalesIsNoop() public {
        uint256 id = _create(PRICE, 5, false);
        _toEnd();
        vm.prank(expert);
        pass.withdrawProceeds(id);
        assertEq(usdc.balanceOf(expert), 0);
        assertEq(pass.accruedFees(), 0);
        assertTrue(pass.getSession(id).paidOut);
    }

    function test_WithdrawProceeds_FreeSession() public {
        uint256 id = _create(0, 5, false);
        _buy(alice, id);
        _toEnd();
        vm.prank(expert);
        pass.withdrawProceeds(id);
        assertEq(usdc.balanceOf(expert), 0);
        assertEq(pass.accruedFees(), 0);
    }

    function test_WithdrawProceeds_UsesFeeSnapshotNotCurrentFee() public {
        uint256 id = _create(PRICE, 5, false); // snapshot 250
        _sellThree(id);
        vm.prank(owner);
        pass.setFeeBps(1000);
        _toEnd();
        vm.prank(expert);
        pass.withdrawProceeds(id);
        assertEq(pass.accruedFees(), 750_000); // 2.5%, not 10%
        assertEq(usdc.balanceOf(expert), 29_250_000);
    }

    function test_WithdrawProceeds_ZeroFeeSnapshotPaysFullGross() public {
        vm.prank(owner);
        pass.setFeeBps(0);
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        _toEnd();
        vm.prank(expert);
        pass.withdrawProceeds(id);
        assertEq(usdc.balanceOf(expert), 30e6);
        assertEq(pass.accruedFees(), 0);
    }

    function test_WithdrawProceeds_ExcludesRefundedTicketsIsNotPossible_CancelledBlocksPayout() public {
        // Refunds only exist for cancelled sessions, and those can never be paid out.
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        vm.prank(expert);
        pass.cancelSession(id);
        // all three holders were auto-refunded; no escrow remains and payout is blocked
        assertEq(usdc.balanceOf(address(pass)), 0);
        vm.warp(_endTime());
        vm.prank(expert);
        vm.expectRevert(ExpertPass.SessionCancelled.selector);
        pass.withdrawProceeds(id);
    }

    // ---------- withdrawFees ----------

    function test_WithdrawFees_OwnerReceivesAccrued() public {
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        _toEnd();
        vm.prank(expert);
        pass.withdrawProceeds(id);
        vm.expectEmit(true, false, false, true, address(pass));
        emit FeesWithdrawn(treasury, 750_000);
        vm.prank(owner);
        pass.withdrawFees(treasury);
        assertEq(usdc.balanceOf(treasury), 750_000);
        assertEq(pass.accruedFees(), 0);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    function test_WithdrawFees_AccumulatesAcrossSessions() public {
        uint256 a = _create(PRICE, 5, false);
        uint256 b = _create(20e6, 5, false);
        _fundAndBuy(alice, a);
        _fundAndBuy(alice, b);
        _toEnd();
        vm.startPrank(expert);
        pass.withdrawProceeds(a);
        pass.withdrawProceeds(b);
        vm.stopPrank();
        assertEq(pass.accruedFees(), (10e6 * 250 / 10000) + (20e6 * 250 / 10000));
    }

    function test_WithdrawFees_DoesNotTouchUnpaidEscrow() public {
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        // no payout yet: no fees accrued, nothing withdrawable
        vm.prank(owner);
        pass.withdrawFees(treasury);
        assertEq(usdc.balanceOf(treasury), 0);
        assertEq(usdc.balanceOf(address(pass)), 3 * uint256(PRICE));
    }

    function test_WithdrawFees_RevertsNonOwner() public {
        vm.prank(expert);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, expert));
        pass.withdrawFees(expert);
    }

    function test_WithdrawFees_RevertsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(ExpertPass.ZeroAddress.selector);
        pass.withdrawFees(address(0));
    }

    function test_WithdrawFees_SecondCallPaysNothing() public {
        uint256 id = _create(PRICE, 5, false);
        _sellThree(id);
        _toEnd();
        vm.prank(expert);
        pass.withdrawProceeds(id);
        vm.startPrank(owner);
        pass.withdrawFees(treasury);
        pass.withdrawFees(treasury);
        vm.stopPrank();
        assertEq(usdc.balanceOf(treasury), 750_000);
    }

    // ---------- setFeeBps ----------

    function test_SetFeeBps_OwnerUpdatesAndEmits() public {
        vm.expectEmit(false, false, false, true, address(pass));
        emit FeeBpsUpdated(FEE, 500);
        vm.prank(owner);
        pass.setFeeBps(500);
        assertEq(pass.feeBps(), 500);
    }

    function test_SetFeeBps_AllowsCapAndZero() public {
        vm.startPrank(owner);
        pass.setFeeBps(1000);
        assertEq(pass.feeBps(), 1000);
        pass.setFeeBps(0);
        assertEq(pass.feeBps(), 0);
        vm.stopPrank();
    }

    function test_SetFeeBps_RevertsAboveCap() public {
        vm.prank(owner);
        vm.expectRevert(ExpertPass.FeeTooHigh.selector);
        pass.setFeeBps(1001);
    }

    function test_SetFeeBps_RevertsNonOwner() public {
        vm.prank(expert);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, expert));
        pass.setFeeBps(100);
    }

    function test_Ownable2Step_TransferRequiresAcceptance() public {
        vm.prank(owner);
        pass.transferOwnership(alice);
        assertEq(pass.owner(), owner);
        vm.prank(alice);
        pass.acceptOwnership();
        assertEq(pass.owner(), alice);
    }
}
