// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract ExpertPassTicketTest is ExpertPassTestBase {
    event TicketPurchased(uint256 indexed id, address indexed buyer, uint256 price);
    event TicketRefunded(uint256 indexed id, address indexed holder, uint256 price);

    // ---------- buyTicket ----------

    function test_BuyTicket_HappyPath() public {
        uint256 id = _create(PRICE, 5, false);
        _fund(alice, 100e6);
        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketPurchased(id, alice, PRICE);
        _buy(alice, id);
        assertEq(pass.balanceOf(alice, id), 1);
        assertEq(usdc.balanceOf(alice), 100e6 - PRICE);
        assertEq(usdc.balanceOf(address(pass)), PRICE);
        assertEq(pass.getSession(id).sold, 1);
        assertTrue(pass.purchased(id, alice));
        assertEq(pass.participantCount(id), 1);
        assertEq(pass.getParticipants(id, 0, 10)[0], alice);
    }

    function test_BuyTicket_SoldOut() public {
        uint256 id = _create(PRICE, 2, false);
        _fundAndBuy(alice, id);
        _fundAndBuy(bob, id);
        _fund(carol, 100e6);
        vm.prank(carol);
        vm.expectRevert(ExpertPass.SoldOut.selector);
        pass.buyTicket(id);
        assertEq(pass.getSession(id).sold, 2);
    }

    function test_BuyTicket_DoublePurchaseReverts() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.AlreadyPurchased.selector);
        pass.buyTicket(id);
    }

    function test_BuyTicket_ExpertCannotBuyOwnSession() public {
        uint256 id = _create(PRICE, 5, false);
        _fund(expert, 100e6);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.ExpertCannotPurchase.selector);
        pass.buyTicket(id);
    }

    function test_BuyTicket_OtherExpertCanBuy() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(expert2, id);
        assertEq(pass.balanceOf(expert2, id), 1);
    }

    function test_BuyTicket_RevertsAtOrAfterStart() public {
        uint256 id = _create(PRICE, 5, false);
        _fund(alice, 100e6);
        vm.warp(START - 1);
        _buy(alice, id); // last valid second
        _fund(bob, 100e6);
        vm.warp(START);
        vm.prank(bob);
        vm.expectRevert(ExpertPass.SessionAlreadyStarted.selector);
        pass.buyTicket(id);
    }

    function test_BuyTicket_RevertsWhenCancelled() public {
        uint256 id = _create(PRICE, 5, false);
        vm.prank(expert);
        pass.cancelSession(id);
        _fund(alice, 100e6);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.SessionCancelled.selector);
        pass.buyTicket(id);
    }

    function test_BuyTicket_UnknownSession() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 42));
        pass.buyTicket(42);
    }

    function test_BuyTicket_FreeSession() public {
        uint256 id = _create(0, 5, false);
        vm.prank(alice); // no funds, no allowance
        pass.buyTicket(id);
        assertEq(pass.balanceOf(alice, id), 1);
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(pass.getSession(id).sold, 1);
    }

    function test_BuyTicket_InsufficientAllowance() public {
        uint256 id = _create(PRICE, 5, false);
        usdc.mint(alice, 100e6);
        vm.startPrank(alice);
        usdc.approve(address(pass), PRICE - 1);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(pass), PRICE - 1, PRICE)
        );
        pass.buyTicket(id);
        vm.stopPrank();
        assertEq(pass.balanceOf(alice, id), 0);
        assertFalse(pass.purchased(id, alice));
    }

    function test_BuyTicket_InsufficientBalance() public {
        uint256 id = _create(PRICE, 5, false);
        usdc.mint(alice, PRICE - 1);
        vm.startPrank(alice);
        usdc.approve(address(pass), type(uint256).max);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, PRICE - 1, PRICE)
        );
        pass.buyTicket(id);
        vm.stopPrank();
    }

    function test_BuyTicket_RejectingContractReceiverReverts() public {
        uint256 id = _create(0, 5, false);
        // a plain contract w/o ERC1155 receiver cannot buy (mint safe-transfer check)
        vm.prank(address(usdc));
        vm.expectRevert();
        pass.buyTicket(id);
    }

    // ---------- refund ----------

    function test_Refund_BurnsAndReturnsExactPrice() public {
        uint256 id = _create(PRICE, 5, false);
        _fund(alice, 100e6);
        _buy(alice, id);
        // cancelSession now auto-refunds the holder in the same tx
        vm.expectEmit(true, true, false, true, address(pass));
        emit TicketRefunded(id, alice, PRICE);
        vm.prank(expert);
        pass.cancelSession(id);
        assertEq(pass.balanceOf(alice, id), 0);
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(pass.getSession(id).refunded, 1);
        // already refunded: nothing left to pull
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NoTicket.selector);
        pass.refund(id);
    }

    function test_Refund_FreeSessionBurnsOnly() public {
        uint256 id = _create(0, 5, false);
        _buy(alice, id);
        vm.prank(expert);
        pass.cancelSession(id);
        assertEq(pass.balanceOf(alice, id), 0);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NoTicket.selector);
        pass.refund(id);
    }

    function test_Refund_ByTransferredHolder() public {
        uint256 id = _create(PRICE, 5, true);
        _fund(alice, 100e6);
        _buy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        vm.prank(expert);
        pass.cancelSession(id);

        // original buyer no longer holds a ticket
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NoTicket.selector);
        pass.refund(id);

        // current holder was auto-refunded at cancel time
        vm.prank(bob);
        vm.expectRevert(ExpertPass.NoTicket.selector);
        pass.refund(id);
        assertEq(usdc.balanceOf(bob), PRICE);
        assertEq(usdc.balanceOf(alice), 100e6 - PRICE + 0);
        assertEq(pass.balanceOf(bob, id), 0);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    function test_Refund_RevertsIfNotCancelled() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.SessionNotCancelled.selector);
        pass.refund(id);
    }

    function test_Refund_RevertsWithoutTicket() public {
        uint256 id = _create(PRICE, 5, false);
        vm.prank(expert);
        pass.cancelSession(id);
        vm.prank(bob);
        vm.expectRevert(ExpertPass.NoTicket.selector);
        pass.refund(id);
    }

    function test_Refund_CannotDoubleRefund() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _fundAndBuy(bob, id);
        vm.prank(expert);
        pass.cancelSession(id);
        // both auto-refunded at cancel
        vm.startPrank(alice);
        vm.expectRevert(ExpertPass.NoTicket.selector);
        pass.refund(id);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(usdc.balanceOf(alice), 1_000_000e6);
        assertEq(usdc.balanceOf(bob), 1_000_000e6);
    }

    function test_Refund_UnknownSession() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 5));
        pass.refund(5);
    }

    function test_Refund_StillWorksAfterSessionTimePassed() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        pass.cancelSession(id);
        vm.warp(_endTime() + 30 days);
        assertEq(pass.balanceOf(alice, id), 0);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NoTicket.selector);
        pass.refund(id);
    }

    function test_Refund_BuyerCannotRebuyAfterRefund() public {
        // cancelled sessions can never be bought again
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        pass.cancelSession(id);
        vm.startPrank(alice);
        vm.expectRevert(ExpertPass.SessionCancelled.selector);
        pass.buyTicket(id);
        vm.stopPrank();
    }

    // ---------- hasAccess ----------

    function test_HasAccess_BeforeAndAfterBuy() public {
        uint256 id = _create(PRICE, 5, false);
        assertFalse(pass.hasAccess(id, alice));
        _fundAndBuy(alice, id);
        assertTrue(pass.hasAccess(id, alice));
        assertFalse(pass.hasAccess(id, bob));
    }

    function test_HasAccess_FollowsTransfer() public {
        uint256 id = _create(PRICE, 5, true);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        assertFalse(pass.hasAccess(id, alice));
        assertTrue(pass.hasAccess(id, bob));
    }

    function test_HasAccess_FalseAfterCancel() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        pass.cancelSession(id);
        assertFalse(pass.hasAccess(id, alice));
    }

    function test_HasAccess_FalseAfterRefund() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        pass.cancelSession(id);
        assertEq(pass.balanceOf(alice, id), 0);
        assertFalse(pass.hasAccess(id, alice));
    }

    function test_HasAccess_FalseForNonexistentSession() public view {
        assertFalse(pass.hasAccess(123, alice));
        assertFalse(pass.hasAccess(0, address(0)));
    }

    function test_HasAccess_CertificateIdDoesNotGrantTicketAccess() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _toEnd();
        address[] memory r = new address[](1);
        r[0] = alice;
        vm.prank(expert);
        pass.mintCertificates(id, r);
        assertFalse(pass.hasAccess(pass.certificateId(id), alice));
    }
}
