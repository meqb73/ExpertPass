// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ExpertPass} from "../ExpertPass.sol";
import {BlockableUSDC, ToggleReceiver} from "./RefundMocks.sol";

/// Cancellation must survive a token that refuses a holder and receivers that reject ERC-1155.
contract ExpertPassHostileTest is Test {
    event TicketRefunded(uint256 indexed id, address indexed holder, uint256 price);

    BlockableUSDC internal tok;
    ExpertPass internal pass;

    address internal owner = makeAddr("owner");
    address internal expert = makeAddr("expert");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant T0 = 1_700_000_000;
    uint64 internal constant START = uint64(T0 + 1 days);
    uint128 internal constant PRICE = 10e6;
    uint256 internal constant FUND = 100e6;
    string internal constant LINK = "https://example.com/session";

    function setUp() public {
        vm.warp(T0);
        tok = new BlockableUSDC();
        pass = new ExpertPass(address(tok), owner, 250);
        vm.prank(expert);
        pass.registerExpert("Expert", "");
    }

    function _create(bool transferable) internal returns (uint256 id) {
        vm.prank(expert);
        id = pass.createSession("T", "D", 0, PRICE, 100, START, 2 hours, transferable, LINK, "");
    }

    function _buy(address who, uint256 id) internal {
        tok.mint(who, FUND);
        vm.startPrank(who);
        tok.approve(address(pass), type(uint256).max);
        pass.buyTicket(id);
        vm.stopPrank();
    }

    function _cancel(uint256 id) internal {
        vm.prank(expert);
        pass.cancelSession(id);
    }

    // ---------- blacklisted holder (revert = 1, returns false = 2) ----------

    function _blacklistScenario(uint8 mode) internal {
        uint256 id = _create(false);
        _buy(alice, id);
        _buy(bob, id);
        _buy(carol, id);
        tok.setBlock(bob, mode);

        _cancel(id); // must not revert

        assertTrue(pass.getSession(id).cancelled);
        // others refunded in full
        assertEq(tok.balanceOf(alice), FUND);
        assertEq(tok.balanceOf(carol), FUND);
        assertEq(pass.balanceOf(alice, id), 0);
        assertEq(pass.balanceOf(carol, id), 0);
        // blacklisted holder keeps ticket, nothing recorded as refunded
        assertEq(pass.balanceOf(bob, id), 1);
        assertEq(tok.balanceOf(bob), FUND - PRICE);
        assertEq(pass.refundedAmount(id, bob), 0);
        assertEq(pass.getSession(id).refunded, 2);
        assertEq(tok.balanceOf(address(pass)), PRICE, "bob's escrow intact");
        assertEq(pass.refundCursor(id), 3);
        assertEq(pass.refundsPending(id), 0);

        // pull refund still fails while blocked, state unchanged
        vm.prank(bob);
        vm.expectRevert();
        pass.refund(id);
        assertEq(pass.balanceOf(bob, id), 1);
        assertEq(tok.balanceOf(address(pass)), PRICE);

        // processRefunds does not revisit him
        assertEq(pass.processRefunds(id, 100), 0);
        assertEq(pass.balanceOf(bob, id), 1);

        // after unblocking, bob pulls via refund()
        tok.setBlock(bob, 0);
        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, bob, PRICE);
        vm.prank(bob);
        pass.refund(id);
        assertEq(tok.balanceOf(bob), FUND);
        assertEq(pass.balanceOf(bob, id), 0);
        assertEq(pass.refundedAmount(id, bob), PRICE);
        assertEq(pass.getSession(id).refunded, 3);
        assertEq(tok.balanceOf(address(pass)), 0);
    }

    function test_Cancel_BlacklistedHolderReverting_CancelSucceedsAndHolderCanPullLater() public {
        _blacklistScenario(1);
    }

    function test_Cancel_BlacklistedHolderReturnsFalse_CancelSucceedsAndHolderCanPullLater() public {
        _blacklistScenario(2);
    }

    function test_Cancel_BlacklistedFirstHolderDoesNotBlockOthers() public {
        uint256 id = _create(false);
        _buy(alice, id);
        _buy(bob, id);
        tok.setBlock(alice, 1);
        _cancel(id);
        assertEq(pass.balanceOf(alice, id), 1);
        assertEq(pass.balanceOf(bob, id), 0);
        assertEq(tok.balanceOf(bob), FUND);
    }

    function test_Cancel_BlacklistedWithin40_RestOfBatchAndProcessRefundsStillPay() public {
        uint256 id = _create(true);
        address[] memory buyers = new address[](45);
        for (uint256 i; i < 45; ++i) {
            buyers[i] = address(uint160(0x5000 + i));
            _buy(buyers[i], id);
        }
        tok.setBlock(buyers[3], 2); // inside the automatic window
        tok.setBlock(buyers[43], 1); // inside the processRefunds tail
        _cancel(id);
        assertEq(pass.getSession(id).refunded, 39);
        assertEq(pass.balanceOf(buyers[3], id), 1);
        assertEq(pass.refundsPending(id), 5);

        assertEq(pass.processRefunds(id, 100), 5);
        assertEq(pass.getSession(id).refunded, 43);
        assertEq(pass.balanceOf(buyers[43], id), 1);
        assertEq(pass.balanceOf(buyers[44], id), 0);
        assertEq(tok.balanceOf(buyers[44]), FUND);
        assertEq(tok.balanceOf(address(pass)), 2 * uint256(PRICE));

        // both blocked holders recover their money once unblocked
        tok.setBlock(buyers[3], 0);
        tok.setBlock(buyers[43], 0);
        vm.prank(buyers[3]);
        pass.refund(id);
        vm.prank(buyers[43]);
        pass.refund(id);
        assertEq(tok.balanceOf(address(pass)), 0);
        assertEq(pass.getSession(id).refunded, 45);
    }

    function test_Cancel_BlacklistedHolderOfTwoTickets_PullsOneAtATime() public {
        uint256 id = _create(true);
        _buy(alice, id);
        _buy(bob, id);
        vm.prank(bob);
        pass.safeTransferFrom(bob, alice, id, 1, "");
        tok.setBlock(alice, 1);
        _cancel(id);
        assertEq(pass.balanceOf(alice, id), 2);
        assertEq(tok.balanceOf(address(pass)), 2 * uint256(PRICE));
        tok.setBlock(alice, 0);
        vm.startPrank(alice);
        pass.refund(id);
        assertEq(pass.refundedAmount(id, alice), PRICE);
        pass.refund(id);
        vm.stopPrank();
        assertEq(pass.refundedAmount(id, alice), 2 * uint256(PRICE));
        assertEq(tok.balanceOf(address(pass)), 0);
    }

    // ---------- malicious ERC-1155 receiver ----------

    function test_Cancel_RejectingErc1155ReceiverCannotBlockCancel() public {
        ToggleReceiver rec = new ToggleReceiver();
        tok.mint(address(rec), FUND);
        uint256 id = _create(false);
        _buy(alice, id);
        rec.buy(pass, tok, id, PRICE); // accepted at purchase time
        _buy(carol, id);
        rec.setReject(true); // from now on it rejects every ERC-1155 receipt

        _cancel(id); // burn needs no receiver callback

        assertEq(pass.balanceOf(address(rec), id), 0);
        assertEq(tok.balanceOf(address(rec)), FUND);
        assertEq(tok.balanceOf(alice), FUND);
        assertEq(tok.balanceOf(carol), FUND);
        assertEq(tok.balanceOf(address(pass)), 0);
        assertEq(pass.getSession(id).refunded, 3);
        assertEq(pass.refundedAmount(id, address(rec)), PRICE);
    }

    function test_Cancel_RejectingReceiverBeyond40_ProcessRefundsStillWorks() public {
        ToggleReceiver rec = new ToggleReceiver();
        tok.mint(address(rec), FUND);
        uint256 id = _create(false);
        for (uint256 i; i < 40; ++i) _buy(address(uint160(0x6000 + i)), id);
        rec.buy(pass, tok, id, PRICE);
        rec.setReject(true);
        _cancel(id);
        assertEq(pass.balanceOf(address(rec), id), 1);
        pass.processRefunds(id, 1);
        assertEq(pass.balanceOf(address(rec), id), 0);
        assertEq(tok.balanceOf(address(rec)), FUND);
        assertEq(tok.balanceOf(address(pass)), 0);
    }
}
