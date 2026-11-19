// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";
import {MaliciousHolder} from "./MockUSDC.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Automatic refunds performed by cancelSession for up to AUTO_REFUND_LIMIT holders.
contract ExpertPassAutoRefundTest is ExpertPassTestBase {
    event TicketRefunded(uint256 indexed id, address indexed holder, uint256 price);
    event SessionCancelledEvent(uint256 indexed id);

    uint256 internal constant FUND = 100e6;

    function _buyers3(uint256 id) internal {
        _fund(alice, FUND);
        _fund(bob, FUND);
        _fund(carol, FUND);
        _buy(alice, id);
        _buy(bob, id);
        _buy(carol, id);
    }

    // ---------- core auto refund ----------

    function test_Cancel_AutoRefundsEveryHolderInSameTx() public {
        uint256 id = _create(PRICE, 10, false);
        _buyers3(id);
        assertEq(usdc.balanceOf(address(pass)), 3 * uint256(PRICE));
        assertEq(usdc.balanceOf(alice), FUND - PRICE);

        vm.expectEmit(true, false, false, false, address(pass));
        emit SessionCancelledEvent(id);
        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, alice, PRICE);
        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, bob, PRICE);
        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, carol, PRICE);
        _cancel(id);

        address[3] memory hs = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) {
            assertEq(usdc.balanceOf(hs[i]), FUND, "exact USDC back");
            assertEq(pass.balanceOf(hs[i], id), 0, "ticket burned");
            assertEq(pass.refundedAmount(id, hs[i]), PRICE);
            assertFalse(pass.hasAccess(id, hs[i]));
        }
        ExpertPass.Session memory s = pass.getSession(id);
        assertTrue(s.cancelled);
        assertEq(s.refunded, 3);
        assertEq(s.sold, 3);
        assertEq(usdc.balanceOf(address(pass)), 0, "no escrow left");
        assertEq(pass.refundCursor(id), 3);
        assertEq(pass.refundsPending(id), 0);
    }

    function test_Cancel_NoBuyersCancelsCleanly() public {
        uint256 id = _create(PRICE, 10, false);
        _cancel(id);
        assertTrue(pass.getSession(id).cancelled);
        assertEq(pass.refundCursor(id), 0);
        assertEq(pass.refundsPending(id), 0);
    }

    function test_Cancel_SoulboundTicketsAlsoRefunded() public {
        uint256 id = _create(PRICE, 10, false);
        _buyers3(id);
        // soulbound: holder cannot move it, yet cancel still burns + refunds
        vm.prank(alice);
        vm.expectRevert(ExpertPass.SoulboundToken.selector);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        _cancel(id);
        assertEq(pass.balanceOf(alice, id), 0);
        assertEq(pass.balanceOf(bob, id), 0);
        assertEq(pass.balanceOf(carol, id), 0);
        assertEq(usdc.balanceOf(alice), FUND);
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(pass.getSession(id).refunded, 3);
    }

    function test_Cancel_FreeSessionBurnsWithoutUsdc() public {
        uint256 id = _create(0, 10, true);
        _buy(alice, id);
        _buy(bob, id);
        uint256 supplyBefore = usdc.totalSupply();
        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, alice, 0);
        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, bob, 0);
        _cancel(id);
        assertEq(pass.balanceOf(alice, id), 0);
        assertEq(pass.balanceOf(bob, id), 0);
        assertEq(pass.getSession(id).refunded, 2);
        assertEq(pass.refundedAmount(id, alice), 0);
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(usdc.totalSupply(), supplyBefore);
    }

    function test_Cancel_HolderWithTwoTicketsRefundedTwicePrice() public {
        uint256 id = _create(PRICE, 10, true);
        _fund(alice, FUND);
        _fund(bob, FUND);
        _buy(alice, id);
        _buy(bob, id);
        vm.prank(bob);
        pass.safeTransferFrom(bob, alice, id, 1, "");
        assertEq(pass.balanceOf(alice, id), 2);
        assertEq(pass.balanceOf(bob, id), 0);

        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, alice, 2 * uint256(PRICE));
        _cancel(id);

        assertEq(pass.balanceOf(alice, id), 0);
        assertEq(usdc.balanceOf(alice), FUND - PRICE + 2 * uint256(PRICE));
        assertEq(usdc.balanceOf(bob), FUND - PRICE); // bob paid but sold his ticket on
        assertEq(pass.refundedAmount(id, alice), 2 * uint256(PRICE));
        assertEq(pass.refundedAmount(id, bob), 0);
        assertEq(pass.getSession(id).refunded, 2);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    function test_Cancel_TransferredAwayTicketRefundsCurrentHolderOnly() public {
        uint256 id = _create(PRICE, 10, true);
        _fund(alice, FUND);
        _buy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        _cancel(id);
        assertEq(usdc.balanceOf(bob), PRICE);
        assertEq(usdc.balanceOf(alice), FUND - PRICE);
        assertEq(pass.refundedAmount(id, bob), PRICE);
        assertEq(pass.refundedAmount(id, alice), 0);
        assertEq(pass.refundCursor(id), 2); // alice examined (no balance) and skipped
    }

    function test_Cancel_Exactly40HoldersAllRefunded() public {
        uint256 id = _create(PRICE, 100, false);
        _buyMany(id, 0, 40, PRICE);
        assertEq(usdc.balanceOf(address(pass)), 40 * uint256(PRICE));
        _cancel(id);
        assertEq(pass.getSession(id).refunded, 40);
        assertEq(pass.refundCursor(id), 40);
        assertEq(pass.refundsPending(id), 0);
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(usdc.balanceOf(_buyer(39)), PRICE);
    }

    function test_Cancel_ConstantIs40() public view {
        assertEq(pass.AUTO_REFUND_LIMIT(), 40);
    }

    // ---------- pull refund() still works ----------

    function test_Refund_PullStillWorksForUnexaminedHolder() public {
        uint256 id = _create(PRICE, 100, false);
        _buyMany(id, 0, 41, PRICE);
        _cancel(id);
        address late = _buyer(40);
        assertEq(pass.balanceOf(late, id), 1);

        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, late, PRICE);
        vm.prank(late);
        pass.refund(id);

        assertEq(usdc.balanceOf(late), PRICE);
        assertEq(pass.balanceOf(late, id), 0);
        assertEq(pass.refundedAmount(id, late), PRICE);
        assertEq(pass.getSession(id).refunded, 41);
        assertEq(usdc.balanceOf(address(pass)), 0);

        // processRefunds afterwards skips the already-refunded holder: no double payment
        pass.processRefunds(id, 10);
        assertEq(usdc.balanceOf(late), PRICE);
        assertEq(pass.getSession(id).refunded, 41);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    function test_Refund_PullByExaminedHolderWhoReceivedTicketAfterCancel() public {
        uint256 id = _create(PRICE, 100, true);
        _buyMany(id, 0, 41, PRICE);
        _cancel(id);
        address examined = _buyer(0); // refunded at cancel, cursor already past
        address late = _buyer(40);
        vm.prank(late);
        pass.safeTransferFrom(late, examined, id, 1, "");

        // cursor never revisits `examined`; its ticket needs a pull refund
        pass.processRefunds(id, 100);
        assertEq(pass.balanceOf(examined, id), 1);

        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, examined, PRICE);
        vm.prank(examined);
        pass.refund(id);
        // refundedAmount is cumulative: auto refund at cancel + this pull refund
        assertEq(pass.refundedAmount(id, examined), 2 * uint256(PRICE));
        assertEq(usdc.balanceOf(examined), 2 * uint256(PRICE));
        assertEq(pass.getSession(id).refunded, 41);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    function test_Refund_PullFreeSessionRecordsZero() public {
        uint256 id = _create(0, 100, false);
        _buyMany(id, 0, 41, 0);
        _cancel(id);
        address late = _buyer(40);
        vm.prank(late);
        pass.refund(id);
        assertEq(pass.balanceOf(late, id), 0);
        assertEq(pass.refundedAmount(id, late), 0);
        assertEq(pass.getSession(id).refunded, 41);
    }

    // ---------- transfer after cancel ----------

    function test_TransferAfterCancel_NewParticipantRefundedByProcessRefunds() public {
        uint256 id = _create(PRICE, 100, true);
        _buyMany(id, 0, 41, PRICE);
        _cancel(id);
        address late = _buyer(40);
        vm.prank(late);
        pass.safeTransferFrom(late, carol, id, 1, "");

        assertEq(pass.participantCount(id), 42);
        assertEq(pass.refundsPending(id), 2); // late (index 40) + carol (index 41)
        vm.prank(makeAddr("stranger"));
        uint256 processed = pass.processRefunds(id, 100);
        assertEq(processed, 2);
        assertEq(usdc.balanceOf(carol), PRICE);
        assertEq(pass.balanceOf(carol, id), 0);
        assertEq(pass.balanceOf(late, id), 0);
        assertEq(pass.refundedAmount(id, carol), PRICE);
        assertEq(pass.refundsPending(id), 0);
        assertEq(pass.getSession(id).refunded, 41);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    // ---------- hostile participants cannot block cancel ----------

    function test_Cancel_HookedUsdcCannotReenterDuringAutoRefund() public {
        MaliciousHolder mal = new MaliciousHolder(pass, usdc);
        usdc.mint(address(mal), 1_000e6);
        uint256 id = _create(PRICE, 10, true);
        mal.buy(id, PRICE);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, address(mal), id, 1, "");
        assertEq(pass.balanceOf(address(mal), id), 2);

        mal.arm(MaliciousHolder.Mode.RefundOnUSDC, id);
        usdc.setHook(address(mal));
        uint256 before = usdc.balanceOf(address(mal));
        _cancel(id);

        assertTrue(mal.reentryAttempted(), "hook not reached");
        assertFalse(mal.reentrySucceeded(), "reentry succeeded");
        assertEq(bytes4(mal.lastError()), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(usdc.balanceOf(address(mal)) - before, 2 * uint256(PRICE), "exactly 2x price");
        assertEq(pass.balanceOf(address(mal), id), 0);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    // ---------- cancel access control unchanged ----------

    function test_Cancel_OnlyExpertAndOnlyOnce() public {
        uint256 id = _create(PRICE, 10, false);
        _buyers3(id);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NotSessionExpert.selector);
        pass.cancelSession(id);
        assertEq(pass.balanceOf(alice, id), 1);
        _cancel(id);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.SessionCancelled.selector);
        pass.cancelSession(id);
    }
}
