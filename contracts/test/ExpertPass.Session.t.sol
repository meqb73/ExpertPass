// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

contract ExpertPassSessionTest is ExpertPassTestBase {
    event ExpertRegistered(address indexed expert, string name);
    event ExpertProfileUpdated(address indexed expert, string name, string bio);
    event SessionCreated(uint256 indexed id, address indexed expert);
    event SessionUpdated(uint256 indexed id);
    event SessionCancelledEvent(uint256 indexed id);

    // ---------- constructor ----------

    function test_Constructor_SetsState() public view {
        assertEq(address(pass.usdc()), address(usdc));
        assertEq(pass.owner(), owner);
        assertEq(pass.feeBps(), FEE);
        assertEq(pass.sessionCount(), 0);
        assertEq(pass.MAX_FEE_BPS(), 1000);
    }

    function test_Constructor_RevertsOnZeroUsdc() public {
        vm.expectRevert(ExpertPass.ZeroAddress.selector);
        new ExpertPass(address(0), owner, 0);
    }

    function test_Constructor_RevertsOnFeeTooHigh() public {
        vm.expectRevert(ExpertPass.FeeTooHigh.selector);
        new ExpertPass(address(usdc), owner, 1001);
    }

    function test_Constructor_AcceptsMaxFee() public {
        ExpertPass p = new ExpertPass(address(usdc), owner, 1000);
        assertEq(p.feeBps(), 1000);
    }

    // ---------- registerExpert ----------

    function test_RegisterExpert_StoresProfileAndEmits() public {
        vm.expectEmit(true, false, false, true, address(pass));
        emit ExpertRegistered(alice, "Alice");
        vm.expectEmit(true, false, false, true, address(pass));
        emit ExpertProfileUpdated(alice, "Alice", "my bio");
        vm.prank(alice);
        pass.registerExpert("Alice", "my bio");
        ExpertPass.Expert memory e = pass.getExpert(alice);
        assertEq(e.name, "Alice");
        assertEq(e.bio, "my bio");
        assertTrue(e.registered);
    }

    function test_RegisterExpert_CanReplaceProfile() public {
        vm.prank(expert);
        pass.registerExpert("New Name", "New bio");
        assertEq(pass.getExpert(expert).name, "New Name");
        assertEq(pass.getExpert(expert).bio, "New bio");
    }

    function test_RegisterExpert_BoundaryLengthsAllowed() public {
        vm.prank(alice);
        pass.registerExpert(string(new bytes(64)), string(new bytes(280)));
        assertTrue(pass.getExpert(alice).registered);
    }

    function test_RegisterExpert_RevertsEmptyName() public {
        vm.prank(alice);
        vm.expectRevert(ExpertPass.InvalidName.selector);
        pass.registerExpert("", "bio");
    }

    function test_RegisterExpert_RevertsLongName() public {
        vm.prank(alice);
        vm.expectRevert(ExpertPass.InvalidName.selector);
        pass.registerExpert(string(new bytes(65)), "bio");
    }

    function test_RegisterExpert_RevertsLongBio() public {
        vm.prank(alice);
        vm.expectRevert(ExpertPass.InvalidBio.selector);
        pass.registerExpert("Alice", string(new bytes(281)));
    }

    function test_GetExpert_UnregisteredIsDefault() public view {
        ExpertPass.Expert memory e = pass.getExpert(carol);
        assertFalse(e.registered);
        assertEq(bytes(e.name).length, 0);
    }

    // ---------- createSession ----------

    function test_CreateSession_StoresImmutablesAndEmits() public {
        vm.expectEmit(true, true, false, false, address(pass));
        emit SessionCreated(1, expert);
        vm.prank(expert);
        uint256 id = pass.createSession("My Title", "My Desc", 3, 25e6, 50, START, DUR, true, LINK, "");
        assertEq(id, 1);
        assertEq(pass.sessionCount(), 1);
        ExpertPass.Session memory s = pass.getSession(id);
        assertEq(s.expert, expert);
        assertEq(s.category, 3);
        assertTrue(s.transferable);
        assertFalse(s.cancelled);
        assertFalse(s.paidOut);
        assertEq(s.feeBps, FEE);
        assertEq(s.duration, DUR);
        assertEq(s.startTime, START);
        assertEq(s.supply, 50);
        assertEq(s.sold, 0);
        assertEq(s.price, 25e6);
        assertEq(s.title, "My Title");
        assertEq(s.description, "My Desc");
    }

    function test_CreateSession_IdsIncrement() public {
        assertEq(_create(PRICE, 1, false), 1);
        assertEq(_create(PRICE, 1, false), 2);
        assertEq(pass.sessionCount(), 2);
    }

    function test_CreateSession_SnapshotsFeeAtCreation() public {
        uint256 id = _create(PRICE, 5, false);
        vm.prank(owner);
        pass.setFeeBps(900);
        assertEq(pass.getSession(id).feeBps, FEE);
        assertEq(pass.getSession(_create(PRICE, 5, false)).feeBps, 900);
    }

    function test_CreateSession_FreeAndBoundaryValuesAllowed() public {
        vm.startPrank(expert);
        pass.createSession(string(new bytes(120)), string(new bytes(4000)), 7, 0, 100000, START, 5 minutes, false, LINK, "");
        pass.createSession("t", "", 0, 1, 1, START, 30 days, false, LINK, "");
        vm.stopPrank();
        assertEq(pass.sessionCount(), 2);
    }

    function test_CreateSession_RevertsUnregisteredExpert() public {
        vm.prank(alice);
        vm.expectRevert(ExpertPass.ExpertNotRegistered.selector);
        pass.createSession("t", "d", 0, PRICE, 1, START, DUR, false, LINK, "");
    }

    function test_CreateSession_RevertsBadTitle() public {
        vm.startPrank(expert);
        vm.expectRevert(ExpertPass.InvalidTitle.selector);
        pass.createSession("", "d", 0, PRICE, 1, START, DUR, false, LINK, "");
        vm.expectRevert(ExpertPass.InvalidTitle.selector);
        pass.createSession(string(new bytes(121)), "d", 0, PRICE, 1, START, DUR, false, LINK, "");
        vm.stopPrank();
    }

    function test_CreateSession_RevertsLongDescription() public {
        vm.prank(expert);
        vm.expectRevert(ExpertPass.InvalidDescription.selector);
        pass.createSession("t", string(new bytes(4001)), 0, PRICE, 1, START, DUR, false, LINK, "");
    }

    function test_CreateSession_RevertsBadCategory() public {
        vm.prank(expert);
        vm.expectRevert(ExpertPass.InvalidCategory.selector);
        pass.createSession("t", "d", 8, PRICE, 1, START, DUR, false, LINK, "");
    }

    function test_CreateSession_RevertsBadSupply() public {
        vm.startPrank(expert);
        vm.expectRevert(ExpertPass.InvalidSupply.selector);
        pass.createSession("t", "d", 0, PRICE, 0, START, DUR, false, LINK, "");
        vm.expectRevert(ExpertPass.InvalidSupply.selector);
        pass.createSession("t", "d", 0, PRICE, 100001, START, DUR, false, LINK, "");
        vm.stopPrank();
    }

    function test_CreateSession_RevertsStartNotInFuture() public {
        vm.startPrank(expert);
        vm.expectRevert(ExpertPass.InvalidStartTime.selector);
        pass.createSession("t", "d", 0, PRICE, 1, uint64(block.timestamp), DUR, false, LINK, "");
        vm.expectRevert(ExpertPass.InvalidStartTime.selector);
        pass.createSession("t", "d", 0, PRICE, 1, uint64(block.timestamp - 1), DUR, false, LINK, "");
        vm.stopPrank();
    }

    function test_CreateSession_RevertsBadDuration() public {
        vm.startPrank(expert);
        vm.expectRevert(ExpertPass.InvalidDuration.selector);
        pass.createSession("t", "d", 0, PRICE, 1, START, 5 minutes - 1, false, LINK, "");
        vm.expectRevert(ExpertPass.InvalidDuration.selector);
        pass.createSession("t", "d", 0, PRICE, 1, START, 30 days + 1, false, LINK, "");
        vm.stopPrank();
    }

    // ---------- views ----------

    function test_GetSession_RevertsForUnknownId() public {
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 99));
        pass.getSession(99);
    }

    function test_GetSessions_Pagination() public {
        for (uint256 i; i < 5; ++i) _create(PRICE, 1, false);
        assertEq(pass.getSessions(0, 10).length, 5);
        assertEq(pass.getSessions(2, 2).length, 2);
        assertEq(pass.getSessions(2, 2)[0].expert, expert);
        assertEq(pass.getSessions(5, 10).length, 1);
        assertEq(pass.getSessions(6, 10).length, 0);
        assertEq(pass.getSessions(1, 0).length, 0);
    }

    // ---------- updateSession ----------

    function test_UpdateSession_BeforeStartNoSales_ChangesEverything() public {
        uint256 id = _create(PRICE, 5, false);
        uint64 newStart = START + 3 days;
        vm.expectEmit(true, false, false, false, address(pass));
        emit SessionUpdated(id);
        vm.prank(expert);
        pass.updateSession(id, "New T", "New D", 5, newStart, 1 days);
        ExpertPass.Session memory s = pass.getSession(id);
        assertEq(s.title, "New T");
        assertEq(s.description, "New D");
        assertEq(s.category, 5);
        assertEq(s.startTime, newStart);
        assertEq(s.duration, 1 days);
        // immutables untouched
        assertEq(s.price, PRICE);
        assertEq(s.supply, 5);
        assertEq(s.feeBps, FEE);
    }

    function test_UpdateSession_RevertsOnlyExpert() public {
        uint256 id = _create(PRICE, 5, false);
        vm.prank(expert2);
        vm.expectRevert(ExpertPass.NotSessionExpert.selector);
        pass.updateSession(id, "T", "D", 0, START, DUR);
        vm.prank(owner);
        vm.expectRevert(ExpertPass.NotSessionExpert.selector);
        pass.updateSession(id, "T", "D", 0, START, DUR);
    }

    function test_UpdateSession_RevertsUnknownSession() public {
        vm.prank(expert);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 7));
        pass.updateSession(7, "T", "D", 0, START, DUR);
    }

    function test_UpdateSession_RevertsAfterStart() public {
        uint256 id = _create(PRICE, 5, false);
        vm.warp(START);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.SessionAlreadyStarted.selector);
        pass.updateSession(id, "T", "D", 0, START + 1 days, DUR);
    }

    function test_UpdateSession_RevertsWhenCancelled() public {
        uint256 id = _create(PRICE, 5, false);
        vm.startPrank(expert);
        pass.cancelSession(id);
        vm.expectRevert(ExpertPass.SessionCancelled.selector);
        pass.updateSession(id, "T", "D", 0, START, DUR);
        vm.stopPrank();
    }

    function test_UpdateSession_ValidatesFieldsWhenNoSales() public {
        uint256 id = _create(PRICE, 5, false);
        vm.startPrank(expert);
        vm.expectRevert(ExpertPass.InvalidTitle.selector);
        pass.updateSession(id, "", "D", 0, START, DUR);
        vm.expectRevert(ExpertPass.InvalidDescription.selector);
        pass.updateSession(id, "T", string(new bytes(4001)), 0, START, DUR);
        vm.expectRevert(ExpertPass.InvalidCategory.selector);
        pass.updateSession(id, "T", "D", 8, START, DUR);
        vm.expectRevert(ExpertPass.InvalidStartTime.selector);
        pass.updateSession(id, "T", "D", 0, uint64(block.timestamp), DUR);
        vm.expectRevert(ExpertPass.InvalidDuration.selector);
        pass.updateSession(id, "T", "D", 0, START, 1 minutes);
        vm.stopPrank();
    }

    function test_UpdateSession_ScheduleLockedWhenSold_StartChange() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.ScheduleLocked.selector);
        pass.updateSession(id, "Title", "Desc", 0, START + 1, DUR);
    }

    function test_UpdateSession_ScheduleLockedWhenSold_DurationChange() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.ScheduleLocked.selector);
        pass.updateSession(id, "Title", "Desc", 0, START, DUR + 1);
    }

    function test_UpdateSession_TextAndCategoryEditableWhenSold() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        pass.updateSession(id, "Renamed", "Redescribed", 6, START, DUR);
        ExpertPass.Session memory s = pass.getSession(id);
        assertEq(s.title, "Renamed");
        assertEq(s.description, "Redescribed");
        assertEq(s.category, 6);
        assertEq(s.startTime, START);
        assertEq(s.duration, DUR);
    }

    function test_UpdateSession_StillValidatesTextWhenSold() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.startPrank(expert);
        vm.expectRevert(ExpertPass.InvalidTitle.selector);
        pass.updateSession(id, "", "D", 0, START, DUR);
        vm.expectRevert(ExpertPass.InvalidCategory.selector);
        pass.updateSession(id, "T", "D", 9, START, DUR);
        vm.stopPrank();
    }

    // ---------- cancelSession ----------

    function test_CancelSession_SetsFlagAndEmits() public {
        uint256 id = _create(PRICE, 5, false);
        vm.expectEmit(true, false, false, false, address(pass));
        emit SessionCancelledEvent(id);
        vm.prank(expert);
        pass.cancelSession(id);
        assertTrue(pass.getSession(id).cancelled);
    }

    function test_CancelSession_RevertsNotExpert() public {
        uint256 id = _create(PRICE, 5, false);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NotSessionExpert.selector);
        pass.cancelSession(id);
    }

    function test_CancelSession_RevertsTwice() public {
        uint256 id = _create(PRICE, 5, false);
        vm.startPrank(expert);
        pass.cancelSession(id);
        vm.expectRevert(ExpertPass.SessionCancelled.selector);
        pass.cancelSession(id);
        vm.stopPrank();
    }

    function test_CancelSession_RevertsAfterStart() public {
        uint256 id = _create(PRICE, 5, false);
        vm.warp(START);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.SessionAlreadyStarted.selector);
        pass.cancelSession(id);
    }

    function test_CancelSession_RevertsUnknown() public {
        vm.prank(expert);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 3));
        pass.cancelSession(3);
    }
}
