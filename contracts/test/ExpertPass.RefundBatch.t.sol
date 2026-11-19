// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

/// More than AUTO_REFUND_LIMIT holders: cancel refunds the first 40, processRefunds finishes the rest.
contract ExpertPassRefundBatchTest is ExpertPassTestBase {
    event TicketRefunded(uint256 indexed id, address indexed holder, uint256 price);

    address internal stranger = makeAddr("stranger");
    uint256 internal id;

    /// 100 buyers, cancelled: 40 refunded, 60 pending.
    function _cancelled100() internal {
        id = _create(PRICE, 150, false);
        _buyMany(id, 0, 100, PRICE);
        _cancel(id);
    }

    function test_Cancel_MoreThan40_RefundsOnlyFirst40() public {
        _cancelled100();
        for (uint256 i; i < 40; ++i) {
            assertEq(pass.balanceOf(_buyer(i), id), 0);
            assertEq(usdc.balanceOf(_buyer(i)), PRICE);
            assertEq(pass.refundedAmount(id, _buyer(i)), PRICE);
        }
        for (uint256 i = 40; i < 100; ++i) {
            assertEq(pass.balanceOf(_buyer(i), id), 1);
            assertEq(usdc.balanceOf(_buyer(i)), 0);
        }
        assertEq(pass.getSession(id).refunded, 40);
        assertEq(pass.refundCursor(id), 40);
        assertEq(pass.refundsPending(id), 60);
        assertEq(usdc.balanceOf(address(pass)), 60 * uint256(PRICE));
    }

    function test_Cancel_TicketEventAmountsOnlyForFirst40() public {
        id = _create(PRICE, 150, false);
        _buyMany(id, 0, 42, PRICE);
        vm.recordLogs();
        _cancel(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 count;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == TicketRefunded.selector) {
                assertEq(abi.decode(logs[i].data, (uint256)), PRICE);
                ++count;
            }
        }
        assertEq(count, 40);
    }

    function test_ProcessRefunds_StrangerFinishesTheRest() public {
        _cancelled100();
        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, _buyer(40), PRICE);
        vm.prank(stranger);
        uint256 processed = pass.processRefunds(id, 100);
        assertEq(processed, 60);
        for (uint256 i = 40; i < 100; ++i) {
            assertEq(pass.balanceOf(_buyer(i), id), 0);
            assertEq(usdc.balanceOf(_buyer(i)), PRICE);
        }
        assertEq(pass.getSession(id).refunded, 100);
        assertEq(pass.refundCursor(id), 100);
        assertEq(pass.refundsPending(id), 0);
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(usdc.balanceOf(stranger), 0, "caller gets nothing");
    }

    function test_ProcessRefunds_PartialBatchesAdvanceCursor() public {
        _cancelled100();
        assertEq(pass.processRefunds(id, 25), 25);
        assertEq(pass.refundCursor(id), 65);
        assertEq(pass.refundsPending(id), 35);
        assertEq(pass.getSession(id).refunded, 65);
        assertEq(usdc.balanceOf(address(pass)), 35 * uint256(PRICE));
        assertEq(pass.processRefunds(id, 1), 1);
        assertEq(pass.refundsPending(id), 34);
        assertEq(pass.processRefunds(id, 100), 34);
        assertEq(pass.refundsPending(id), 0);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    function test_ProcessRefunds_RepeatedCallIsNoop() public {
        _cancelled100();
        pass.processRefunds(id, 100);
        uint256 refundedBefore = pass.getSession(id).refunded;
        uint256 cursorBefore = pass.refundCursor(id);
        vm.recordLogs();
        vm.prank(stranger);
        uint256 processed = pass.processRefunds(id, 100);
        assertEq(processed, 0);
        assertEq(vm.getRecordedLogs().length, 0, "no events");
        assertEq(pass.getSession(id).refunded, refundedBefore);
        assertEq(pass.refundCursor(id), cursorBefore);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    function test_ProcessRefunds_NoopWhenNothingBeyond40() public {
        id = _create(PRICE, 10, false);
        _buyMany(id, 0, 3, PRICE);
        _cancel(id);
        assertEq(pass.processRefunds(id, 1), 0);
    }

    function test_ProcessRefunds_ZeroLimitReverts() public {
        _cancelled100();
        vm.expectRevert(ExpertPass.InvalidLimit.selector);
        pass.processRefunds(id, 0);
    }

    function test_ProcessRefunds_Over100Reverts() public {
        _cancelled100();
        vm.expectRevert(ExpertPass.InvalidLimit.selector);
        pass.processRefunds(id, 101);
        vm.expectRevert(ExpertPass.InvalidLimit.selector);
        pass.processRefunds(id, type(uint256).max);
    }

    function test_ProcessRefunds_BoundaryLimitsAccepted() public {
        _cancelled100();
        assertEq(pass.processRefunds(id, 1), 1);
        assertEq(pass.processRefunds(id, 100), 59);
    }

    function test_ProcessRefunds_NotCancelledReverts() public {
        id = _create(PRICE, 10, false);
        _buyMany(id, 0, 3, PRICE);
        vm.expectRevert(ExpertPass.SessionNotCancelled.selector);
        pass.processRefunds(id, 10);
        // session existence + cancelled are checked before the limit
        vm.expectRevert(ExpertPass.SessionNotCancelled.selector);
        pass.processRefunds(id, 0);
        // nothing was refunded
        assertEq(usdc.balanceOf(address(pass)), 3 * uint256(PRICE));
        assertEq(pass.balanceOf(_buyer(0), id), 1);
    }

    function test_ProcessRefunds_UnknownSessionReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 77));
        pass.processRefunds(77, 10);
    }

    function test_RefundsPending_ZeroWhenNotCancelledOrUnknown() public {
        id = _create(PRICE, 100, false);
        _buyMany(id, 0, 50, PRICE);
        assertEq(pass.refundsPending(id), 0);
        assertEq(pass.refundsPending(999), 0);
    }

    function test_ProcessRefunds_PullRefundedHoldersAreSkippedNotPaidTwice() public {
        _cancelled100();
        vm.prank(_buyer(50));
        pass.refund(id);
        assertEq(usdc.balanceOf(address(pass)), 59 * uint256(PRICE));
        pass.processRefunds(id, 100);
        assertEq(usdc.balanceOf(_buyer(50)), PRICE);
        assertEq(pass.refundedAmount(id, _buyer(50)), PRICE);
        assertEq(pass.getSession(id).refunded, 100);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    /// forge-config: default.fuzz.runs = 32
    function testFuzz_ProcessRefunds_AnyLimitSequenceEndsFullyRefunded(uint256 seed) public {
        _cancelled100();
        uint256 guard;
        while (pass.refundsPending(id) != 0) {
            seed = uint256(keccak256(abi.encode(seed)));
            uint256 m = bound(seed, 1, 100);
            uint256 pendingBefore = pass.refundsPending(id);
            uint256 processed = pass.processRefunds(id, m);
            assertEq(processed, m < pendingBefore ? m : pendingBefore);
            assertGe(usdc.balanceOf(address(pass)), (100 - uint256(pass.getSession(id).refunded)) * PRICE);
            assertLt(++guard, 101);
        }
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(pass.getSession(id).refunded, 100);
    }
}
