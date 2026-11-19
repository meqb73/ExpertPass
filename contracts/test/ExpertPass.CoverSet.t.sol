// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ExpertPassCoverBase} from "./ExpertPass.CoverBase.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

contract ExpertPassCoverSetTest is ExpertPassCoverBase {
    // ---------- setCoverUrl: happy path & events ----------

    function test_Set_ExpertRotates() public {
        uint256 id = _createCover(COVER);
        _setCover(id, COVER2);
        assertEq(pass.getCoverUrl(id), COVER2);
    }

    function test_Set_AddsCoverToSessionWithout() public {
        uint256 id = _createCover("");
        _setCover(id, COVER);
        assertEq(pass.getCoverUrl(id), COVER);
    }

    function test_Set_EmptyClearsCover() public {
        uint256 id = _createCover(COVER);
        _setCover(id, "");
        assertEq(pass.getCoverUrl(id), "");
    }

    function test_Set_ShorterOverwritesLongerFully() public {
        uint256 id = _createCover(_padded("https://", 512));
        _setCover(id, "https://a");
        assertEq(pass.getCoverUrl(id), "https://a");
    }

    function test_Set_EmitsCoverUrlUpdated() public {
        uint256 id = _createCover(COVER);
        vm.expectEmit(true, true, false, true, address(pass));
        emit CoverUrlUpdated(id, expert);
        _setCover(id, COVER2);
    }

    function test_Set_EmitsSingleEventWithoutUrlData() public {
        uint256 id = _createCover(COVER);
        vm.recordLogs();
        _setCover(id, COVER2);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ExpertPass.CoverUrlUpdated.selector);
        assertEq(logs[0].topics.length, 3);
        assertEq(logs[0].topics[1], bytes32(id));
        assertEq(logs[0].topics[2], bytes32(uint256(uint160(expert))));
        assertEq(logs[0].data.length, 0);
    }

    function test_Set_ClearAlwaysEmits() public {
        uint256 id = _createCover("");
        // clearing an already-empty cover still emits
        vm.recordLogs();
        _setCover(id, "");
        assertEq(vm.getRecordedLogs().length, 1);
        // setting the identical URL again still emits
        _setCover(id, COVER);
        vm.recordLogs();
        _setCover(id, COVER);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ExpertPass.CoverUrlUpdated.selector);
    }

    function test_Set_DoesNotTouchEventLink() public {
        uint256 id = _createCover(COVER);
        _setCover(id, COVER2);
        assertEq(pass.getEventLink(id), LINK);
    }

    function test_Set_OnlyAffectsThatSession() public {
        uint256 a = _createCover(COVER);
        uint256 b = _createCover(COVER);
        _setCover(a, COVER2);
        assertEq(pass.getCoverUrl(a), COVER2);
        assertEq(pass.getCoverUrl(b), COVER);
    }

    // ---------- setCoverUrl: access & state reverts ----------

    function test_Set_RevertsForNonExpert() public {
        uint256 id = _createCover(COVER);
        address[4] memory callers = [alice, expert2, owner, address(pass)];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(ExpertPass.NotSessionExpert.selector);
            pass.setCoverUrl(id, COVER2);
        }
        assertEq(pass.getCoverUrl(id), COVER);
    }

    function test_Set_UnknownIdReverts() public {
        _createCover(COVER);
        _expectSetRevert(0, COVER2, abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 0));
        _expectSetRevert(2, COVER2, abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 2));
        _expectSetRevert(
            type(uint256).max, COVER2,
            abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, type(uint256).max)
        );
    }

    function test_Set_UnknownIdBeatsNonExpert() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 7));
        pass.setCoverUrl(7, COVER);
    }

    function test_Set_CancelledReverts() public {
        uint256 id = _createCover(COVER);
        _cancel(id);
        _expectSetRevert(id, COVER2, abi.encodeWithSelector(ExpertPass.SessionCancelled.selector));
        assertEq(pass.getCoverUrl(id), COVER);
    }

    function test_Set_NonExpertOnCancelledGetsNotSessionExpert() public {
        uint256 id = _createCover(COVER);
        _cancel(id);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NotSessionExpert.selector);
        pass.setCoverUrl(id, COVER2);
    }

    function test_Set_RevertsAtEndTimestampAndAfter() public {
        uint256 id = _createCover(COVER);
        vm.warp(_endTime());
        _expectSetRevert(id, COVER2, abi.encodeWithSelector(ExpertPass.SessionAlreadyEnded.selector));
        vm.warp(_endTime() + 30 days);
        _expectSetRevert(id, COVER2, abi.encodeWithSelector(ExpertPass.SessionAlreadyEnded.selector));
        assertEq(pass.getCoverUrl(id), COVER);
    }

    function test_Set_EndedBeatsInvalidUrl() public {
        uint256 id = _createCover(COVER);
        _toEnd();
        _expectSetRevert(id, "ftp://bad", abi.encodeWithSelector(ExpertPass.SessionAlreadyEnded.selector));
    }

    function test_Set_CancelledBeatsInvalidUrl() public {
        uint256 id = _createCover(COVER);
        _cancel(id);
        _expectSetRevert(id, "ftp://bad", abi.encodeWithSelector(ExpertPass.SessionCancelled.selector));
    }

    function test_Set_InvalidUrlReverts() public {
        uint256 id = _createCover(COVER);
        bytes memory err = abi.encodeWithSelector(ExpertPass.InvalidCoverUrl.selector);
        _expectSetRevert(id, "http://example.com/a.png", err);
        _expectSetRevert(id, "HTTPS://example.com/a.png", err);
        _expectSetRevert(id, "ftp://example.com/a.png", err);
        _expectSetRevert(id, "data:image/png;base64,AAAA", err);
        _expectSetRevert(id, "javascript:alert(1)", err);
        _expectSetRevert(id, "https:/example.com", err);
        _expectSetRevert(id, _padded("https://", 513), err);
        assertEq(pass.getCoverUrl(id), COVER);
    }

    function test_Set_BoundariesAccepted() public {
        uint256 id = _createCover("");
        _setCover(id, "https://");
        assertEq(pass.getCoverUrl(id), "https://");
        string memory l512 = _padded("https://", 512);
        _setCover(id, l512);
        assertEq(pass.getCoverUrl(id), l512);
    }

    // ---------- timing ----------

    function test_Set_AllowedAfterSales() public {
        uint256 id = _createCover(COVER);
        _fundAndBuy(alice, id);
        _fundAndBuy(bob, id);
        _setCover(id, COVER2);
        assertEq(pass.getCoverUrl(id), COVER2);
        _setCover(id, "");
        assertEq(pass.getCoverUrl(id), "");
    }

    function test_Set_AllowedMidSessionUntilLastSecond() public {
        uint256 id = _createCover(COVER);
        _fundAndBuy(alice, id);
        vm.warp(START);
        _setCover(id, COVER2);
        assertEq(pass.getCoverUrl(id), COVER2);
        vm.warp(_endTime() - 1);
        _setCover(id, "https://last-second");
        assertEq(pass.getCoverUrl(id), "https://last-second");
    }

    function test_Set_IndependentOfScheduleLock() public {
        uint256 id = _createCover(COVER);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.ScheduleLocked.selector);
        pass.updateSession(id, "Title", "Desc", 0, START + 1, DUR);
        _setCover(id, COVER2);
        assertEq(pass.getCoverUrl(id), COVER2);
    }

    function test_UpdateSession_DoesNotChangeCover() public {
        uint256 id = _createCover(COVER);
        vm.prank(expert);
        pass.updateSession(id, "New", "Desc2", 1, START + 1 hours, DUR);
        assertEq(pass.getCoverUrl(id), COVER);
    }

    // ---------- getCoverUrl ----------

    function test_GetCoverUrl_UnknownIdReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 0));
        pass.getCoverUrl(0);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 1));
        pass.getCoverUrl(1);
        _createCover(COVER);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 2));
        pass.getCoverUrl(2);
        // certificate-namespace ids are not sessions
        uint256 certId = pass.certificateId(1);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, certId));
        pass.getCoverUrl(certId);
    }

    function test_GetCoverUrl_UngatedForAnyoneAnyState() public {
        uint256 id = _createCover(COVER);
        vm.prank(alice);
        assertEq(pass.getCoverUrl(id), COVER);
        vm.prank(address(0xdead));
        assertEq(pass.getCoverUrl(id), COVER);
        _cancel(id);
        vm.prank(alice);
        assertEq(pass.getCoverUrl(id), COVER);
        uint256 id2 = _createCover(COVER2);
        _toEnd();
        vm.prank(bob);
        assertEq(pass.getCoverUrl(id2), COVER2);
    }

    // ---------- getCoverUrls ----------

    /// @dev Sessions 1..5; covers: 1=COVER, 2="", 3=COVER2, 4="", 5=COVER.
    function _seedFive() internal {
        _createCover(COVER);
        _createCover("");
        _createCover(COVER2);
        _createCover("");
        _createCover(COVER);
    }

    function test_GetCoverUrls_FullPageIncludesEmpties() public {
        _seedFive();
        string[] memory r = pass.getCoverUrls(1, 10);
        assertEq(r.length, 5);
        assertEq(r[0], COVER);
        assertEq(r[1], "");
        assertEq(r[2], COVER2);
        assertEq(r[3], "");
        assertEq(r[4], COVER);
    }

    function test_GetCoverUrls_FromZeroTreatedAsOne() public {
        _seedFive();
        string[] memory a = pass.getCoverUrls(0, 10);
        string[] memory b = pass.getCoverUrls(1, 10);
        assertEq(a.length, b.length);
        for (uint256 i; i < a.length; ++i) assertEq(a[i], b[i]);
        assertEq(pass.getCoverUrls(0, 2).length, 2);
    }

    function test_GetCoverUrls_IndexIsFromIdPlusI() public {
        _seedFive();
        string[] memory r = pass.getCoverUrls(3, 2);
        assertEq(r.length, 2);
        assertEq(r[0], COVER2); // session 3
        assertEq(r[1], ""); // session 4
        r = pass.getCoverUrls(5, 10);
        assertEq(r.length, 1);
        assertEq(r[0], COVER);
    }

    function test_GetCoverUrls_OutOfRangeIsEmpty() public {
        assertEq(pass.getCoverUrls(1, 10).length, 0); // no sessions
        assertEq(pass.getCoverUrls(0, 10).length, 0);
        _seedFive();
        assertEq(pass.getCoverUrls(6, 10).length, 0);
        assertEq(pass.getCoverUrls(type(uint256).max, 10).length, 0);
    }

    function test_GetCoverUrls_ZeroLimitIsEmpty() public {
        _seedFive();
        assertEq(pass.getCoverUrls(1, 0).length, 0);
    }

    function test_GetCoverUrls_ClampedToSessionCount() public {
        _seedFive();
        assertEq(pass.getCoverUrls(2, 1000).length, 4);
        assertEq(pass.getCoverUrls(1, type(uint256).max).length, 5);
    }

    function test_GetCoverUrls_LimitCappedAt200() public {
        for (uint256 i; i < 205; ++i) _createCover(i % 2 == 0 ? COVER : "");
        assertEq(pass.getCoverUrls(1, 1000).length, 200);
        assertEq(pass.getCoverUrls(1, type(uint256).max).length, 200);
        assertEq(pass.getCoverUrls(1, 200).length, 200);
        assertEq(pass.getCoverUrls(1, 199).length, 199);
        string[] memory tail = pass.getCoverUrls(201, 1000);
        assertEq(tail.length, 5);
        assertEq(tail[0], COVER); // session 201 (i = 200, even)
        assertEq(tail[1], "");
        assertEq(pass.getCoverUrls(0, 200).length, 200);
    }

    function test_GetCoverUrls_IncludesCancelledAndTracksUpdates() public {
        _seedFive();
        _cancel(1);
        _setCover(3, "");
        _setCover(2, COVER2);
        string[] memory r = pass.getCoverUrls(1, 5);
        assertEq(r[0], COVER); // cancelled session keeps its cover
        assertEq(r[1], COVER2);
        assertEq(r[2], "");
    }

    function test_GetCoverUrls_MatchesGetCoverUrl() public {
        _seedFive();
        string[] memory r = pass.getCoverUrls(1, 5);
        for (uint256 i; i < r.length; ++i) assertEq(r[i], pass.getCoverUrl(i + 1));
    }

    function testFuzz_GetCoverUrls_LengthAndAlignment(uint256 fromId, uint256 limit) public {
        _seedFive();
        string[] memory r = pass.getCoverUrls(fromId, limit);
        uint256 start = fromId == 0 ? 1 : fromId;
        uint256 expectedLen;
        if (start <= 5) {
            expectedLen = 5 - start + 1;
            uint256 cap = limit > 200 ? 200 : limit;
            if (expectedLen > cap) expectedLen = cap;
        }
        assertEq(r.length, expectedLen);
        for (uint256 i; i < r.length; ++i) assertEq(r[i], pass.getCoverUrl(start + i));
    }
}
