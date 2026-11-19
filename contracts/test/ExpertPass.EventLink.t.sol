// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

contract ExpertPassEventLinkTest is ExpertPassTestBase {
    event SessionCreated(uint256 indexed id, address indexed expert);
    event EventLinkUpdated(uint256 indexed id, address indexed expert);

    string internal constant LINK2 = "https://meet.example.org/rotated-room-42";

    // ---------- helpers ----------

    /// @dev `prefix` followed by 'a' padding up to exactly `n` bytes.
    function _padded(string memory prefix, uint256 n) internal pure returns (string memory) {
        bytes memory p = bytes(prefix);
        require(n >= p.length, "n<prefix");
        bytes memory out = new bytes(n);
        for (uint256 i; i < n; ++i) out[i] = i < p.length ? p[i] : bytes1("a");
        return string(out);
    }

    function _contains(bytes memory hay, bytes memory needle) internal pure returns (bool) {
        if (needle.length == 0 || hay.length < needle.length) return false;
        for (uint256 i; i + needle.length <= hay.length; ++i) {
            bool ok = true;
            for (uint256 j; j < needle.length; ++j) {
                if (hay[i + j] != needle[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }

    function _createWith(string memory link) internal returns (uint256 id) {
        vm.prank(expert);
        id = pass.createSession("Title", "Desc", 0, PRICE, 10, START, DUR, false, link, "");
    }

    function _tryCreate(string memory link) internal returns (bool ok) {
        vm.prank(expert);
        try pass.createSession("Title", "Desc", 0, PRICE, 10, START, DUR, false, link, "") returns (uint256) {
            ok = true;
        } catch (bytes memory err) {
            assertEq(bytes4(err), ExpertPass.InvalidEventLink.selector, "wrong revert");
        }
    }

    function _set(uint256 id, string memory link) internal {
        vm.prank(expert);
        pass.setEventLink(id, link);
    }

    function _expectSetRevert(uint256 id, string memory link, bytes memory err) internal {
        vm.prank(expert);
        vm.expectRevert(err);
        pass.setEventLink(id, link);
    }

    // ---------- createSession validation ----------

    function test_Create_StoresLink() public {
        uint256 id = _create(PRICE, 5, false);
        assertEq(pass.getEventLink(id), LINK);
    }

    function test_Create_RevertsEmptyLink() public {
        vm.prank(expert);
        vm.expectRevert(ExpertPass.InvalidEventLink.selector);
        pass.createSession("t", "d", 0, PRICE, 1, START, DUR, false, "", "");
        assertEq(pass.sessionCount(), 0);
    }

    function test_Create_RevertsOneByteNonMatching() public {
        vm.prank(expert);
        vm.expectRevert(ExpertPass.InvalidEventLink.selector);
        pass.createSession("t", "d", 0, PRICE, 1, START, DUR, false, "h", "");
    }

    function test_Create_Accepts512Bytes() public {
        string memory link = _padded("https://", 512);
        assertEq(bytes(link).length, 512);
        uint256 id = _createWith(link);
        assertEq(pass.getEventLink(id), link);
    }

    function test_Create_Rejects513Bytes() public {
        string memory link = _padded("https://", 513);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.InvalidEventLink.selector);
        pass.createSession("t", "d", 0, PRICE, 1, START, DUR, false, link, "");
    }

    function test_Create_Accepts512BytesHttp() public {
        assertTrue(_tryCreate(_padded("http://", 512)));
        assertFalse(_tryCreate(_padded("http://", 513)));
    }

    function test_Create_AcceptsBarePrefixes() public {
        uint256 a = _createWith("http://");
        uint256 b = _createWith("https://");
        assertEq(pass.getEventLink(a), "http://");
        assertEq(pass.getEventLink(b), "https://");
    }

    function test_Create_RejectsBadPrefixes() public {
        assertFalse(_tryCreate("HTTPS://example.com"));
        assertFalse(_tryCreate("HTTP://example.com"));
        assertFalse(_tryCreate("Https://example.com"));
        assertFalse(_tryCreate("ftp://example.com"));
        assertFalse(_tryCreate("javascript:alert(1)"));
        assertFalse(_tryCreate("http:/"));
        assertFalse(_tryCreate("https:/"));
        assertFalse(_tryCreate("http//example.com"));
        assertFalse(_tryCreate(" https://example.com"));
        assertFalse(_tryCreate("example.com"));
        assertEq(pass.sessionCount(), 0);
    }

    function test_Create_InvalidLinkDoesNotConsumeId() public {
        assertFalse(_tryCreate("ftp://x"));
        assertEq(_createWith(LINK), 1);
    }

    // ---------- events ----------

    function test_Create_EmitsSessionCreatedThenEventLinkUpdated() public {
        vm.expectEmit(true, true, false, true, address(pass));
        emit SessionCreated(1, expert);
        vm.expectEmit(true, true, false, true, address(pass));
        emit EventLinkUpdated(1, expert);
        _create(PRICE, 5, false);
    }

    function test_Create_LogsExactlyTwoInOrderWithoutLinkText() public {
        vm.recordLogs();
        _createWith(LINK);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(logs[0].topics[0], ExpertPass.SessionCreated.selector);
        assertEq(logs[1].topics[0], ExpertPass.EventLinkUpdated.selector);
        for (uint256 i; i < logs.length; ++i) {
            assertEq(logs[i].emitter, address(pass));
            assertEq(logs[i].topics.length, 3);
            assertEq(logs[i].topics[1], bytes32(uint256(1)));
            assertEq(logs[i].topics[2], bytes32(uint256(uint160(expert))));
            assertEq(logs[i].data.length, 0, "no log data (no link text)");
        }
    }

    function test_SetEventLink_EmitsAndContainsNoLinkText() public {
        uint256 id = _create(PRICE, 5, false);
        vm.expectEmit(true, true, false, true, address(pass));
        emit EventLinkUpdated(id, expert);
        _set(id, LINK2);

        vm.recordLogs();
        _set(id, LINK);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ExpertPass.EventLinkUpdated.selector);
        assertEq(logs[0].topics.length, 3);
        assertEq(logs[0].data.length, 0);
    }

    // ---------- setEventLink access & state ----------

    function test_SetEventLink_ExpertRotates() public {
        uint256 id = _create(PRICE, 5, false);
        _set(id, LINK2);
        assertEq(pass.getEventLink(id), LINK2);
        _set(id, "http://x");
        assertEq(pass.getEventLink(id), "http://x");
    }

    function test_SetEventLink_RevertsForNonExpert() public {
        uint256 id = _create(PRICE, 5, false);
        address[4] memory callers = [alice, expert2, owner, address(pass)];
        for (uint256 i; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(ExpertPass.NotSessionExpert.selector);
            pass.setEventLink(id, LINK2);
        }
        assertEq(pass.getEventLink(id), LINK);
    }

    function test_SetEventLink_UnknownIdReverts() public {
        _create(PRICE, 5, false);
        _expectSetRevert(0, LINK2, abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 0));
        _expectSetRevert(2, LINK2, abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 2));
        _expectSetRevert(type(uint256).max, LINK2, abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, type(uint256).max));
    }

    function test_SetEventLink_CancelledReverts() public {
        uint256 id = _create(PRICE, 5, false);
        _cancel(id);
        _expectSetRevert(id, LINK2, abi.encodeWithSelector(ExpertPass.SessionCancelled.selector));
        assertEq(pass.getEventLink(id), LINK);
    }

    function test_SetEventLink_NonExpertOnCancelledGetsNotSessionExpert() public {
        uint256 id = _create(PRICE, 5, false);
        _cancel(id);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NotSessionExpert.selector);
        pass.setEventLink(id, LINK2);
    }

    function test_SetEventLink_InvalidLinkReverts() public {
        uint256 id = _create(PRICE, 5, false);
        bytes memory err = abi.encodeWithSelector(ExpertPass.InvalidEventLink.selector);
        _expectSetRevert(id, "", err);
        _expectSetRevert(id, "h", err);
        _expectSetRevert(id, "HTTPS://example.com", err);
        _expectSetRevert(id, "ftp://example.com", err);
        _expectSetRevert(id, "javascript:alert(1)", err);
        _expectSetRevert(id, _padded("https://", 513), err);
        assertEq(pass.getEventLink(id), LINK);
    }

    function test_SetEventLink_ValidationBoundariesAccepted() public {
        uint256 id = _create(PRICE, 5, false);
        _set(id, "http://");
        assertEq(pass.getEventLink(id), "http://");
        _set(id, "https://");
        assertEq(pass.getEventLink(id), "https://");
        string memory l512 = _padded("https://", 512);
        _set(id, l512);
        assertEq(pass.getEventLink(id), l512);
    }

    function test_SetEventLink_ShorterLinkOverwritesLongerFully() public {
        uint256 id = _create(PRICE, 5, false);
        _set(id, _padded("https://", 512));
        _set(id, "http://a");
        assertEq(pass.getEventLink(id), "http://a");
    }

    function test_SetEventLink_OnlyAffectsThatSession() public {
        uint256 a = _create(PRICE, 5, false);
        uint256 b = _create(PRICE, 5, false);
        _set(a, LINK2);
        assertEq(pass.getEventLink(a), LINK2);
        assertEq(pass.getEventLink(b), LINK);
    }

    // ---------- timing ----------

    function test_SetEventLink_AllowedAfterTicketsSold() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _fundAndBuy(bob, id);
        _set(id, LINK2);
        assertEq(pass.getEventLink(id), LINK2);
    }

    function test_SetEventLink_AllowedMidSession() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.warp(START);
        _set(id, LINK2);
        assertEq(pass.getEventLink(id), LINK2);
        vm.warp(_endTime() - 1);
        _set(id, "http://last-second");
        assertEq(pass.getEventLink(id), "http://last-second");
    }

    function test_SetEventLink_RevertsAtEndTimestamp() public {
        uint256 id = _create(PRICE, 5, false);
        _toEnd();
        _expectSetRevert(id, LINK2, abi.encodeWithSelector(ExpertPass.SessionAlreadyEnded.selector));
        vm.warp(_endTime() + 1 days);
        _expectSetRevert(id, LINK2, abi.encodeWithSelector(ExpertPass.SessionAlreadyEnded.selector));
        assertEq(pass.getEventLink(id), LINK);
    }

    function test_SetEventLink_EndedBeatsInvalidLink() public {
        uint256 id = _create(PRICE, 5, false);
        _toEnd();
        _expectSetRevert(id, "ftp://bad", abi.encodeWithSelector(ExpertPass.SessionAlreadyEnded.selector));
    }

    function test_SetEventLink_NotAffectedByScheduleLock() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        // Schedule is locked after a sale, but link rotation is independent of it.
        vm.prank(expert);
        vm.expectRevert(ExpertPass.ScheduleLocked.selector);
        pass.updateSession(id, "Title", "Desc", 0, START + 1, DUR);
        _set(id, LINK2);
        assertEq(pass.getEventLink(id), LINK2);
    }

    function test_SetEventLink_UpdateSessionDoesNotChangeLink() public {
        uint256 id = _create(PRICE, 5, false);
        _set(id, LINK2);
        vm.prank(expert);
        pass.updateSession(id, "New", "New", 1, START + 1 hours, DUR);
        assertEq(pass.getEventLink(id), LINK2);
    }

    // ---------- getEventLink ----------

    function test_GetEventLink_UnknownIdReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 0));
        pass.getEventLink(0);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 1));
        pass.getEventLink(1);
        _create(PRICE, 5, false);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 2));
        pass.getEventLink(2);
        // certificate-namespace id is not a session
        uint256 certId = pass.certificateId(1);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, certId));
        pass.getEventLink(certId);
    }

    /// @dev Documented public behaviour: the link is NOT access-gated.
    function test_GetEventLink_ReadableByNonHolderAndAnyone() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        assertFalse(pass.hasAccess(id, carol));
        vm.prank(carol);
        assertEq(pass.getEventLink(id), LINK);
        vm.prank(address(0xdead));
        assertEq(pass.getEventLink(id), LINK);
        assertEq(pass.getEventLink(id), LINK); // no pranked caller at all
    }

    function test_GetEventLink_ReadableAfterCancelAndAfterEnd() public {
        uint256 a = _create(PRICE, 5, false);
        uint256 b = _create(PRICE, 5, false);
        _cancel(a);
        assertEq(pass.getEventLink(a), LINK);
        _toEnd();
        assertEq(pass.getEventLink(b), LINK);
    }

    // ---------- accounting independence ----------

    function test_Rotation_DoesNotAffectEscrowAndPayout() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _fundAndBuy(bob, id);
        uint256 escrow = usdc.balanceOf(address(pass));
        assertEq(escrow, 2 * uint256(PRICE));
        ExpertPass.Session memory before_ = pass.getSession(id);

        _set(id, LINK2);
        vm.warp(START + 10);
        _set(id, "http://again");

        assertEq(usdc.balanceOf(address(pass)), escrow);
        assertEq(abi.encode(pass.getSession(id)), abi.encode(before_));
        assertEq(pass.accruedFees(), 0);

        _toEnd();
        uint256 gross = 2 * uint256(PRICE);
        uint256 fee = gross * FEE / 10000;
        vm.prank(expert);
        pass.withdrawProceeds(id);
        assertEq(usdc.balanceOf(expert), gross - fee);
        assertEq(pass.accruedFees(), fee);
        assertEq(usdc.balanceOf(address(pass)), fee);
        assertEq(pass.getEventLink(id), "http://again");
    }

    function test_Rotation_DoesNotAffectRefunds() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _fundAndBuy(bob, id);
        _set(id, LINK2);
        _cancel(id);
        assertEq(usdc.balanceOf(alice), 1_000_000e6);
        assertEq(usdc.balanceOf(bob), 1_000_000e6);
        assertEq(usdc.balanceOf(address(pass)), 0);
        assertEq(pass.balanceOf(alice, id), 0);
        assertEq(pass.getSession(id).refunded, 2);
        assertEq(pass.refundedAmount(id, alice), PRICE);
        assertEq(pass.getEventLink(id), LINK2);
    }

    // ---------- getSession / getSessions shape ----------

    function test_GetSession_ShapeUnchangedAndLinkFree() public {
        uint256 id = _create(PRICE, 5, true);
        (bool ok, bytes memory raw) = address(pass).staticcall(abi.encodeCall(ExpertPass.getSession, (id)));
        assertTrue(ok);
        // Decodes as the original 14-field struct and re-encodes byte-identically.
        (ExpertPass.Session memory s) = abi.decode(raw, (ExpertPass.Session));
        assertEq(abi.encode(s), raw);
        assertEq(s.expert, expert);
        assertEq(s.price, PRICE);
        assertEq(s.title, "Title");
        assertEq(s.description, "Desc");
        assertFalse(_contains(raw, bytes("example.com")), "link leaked into getSession");
        // Rotation leaves the returned struct untouched.
        _set(id, LINK2);
        (bool ok2, bytes memory raw2) = address(pass).staticcall(abi.encodeCall(ExpertPass.getSession, (id)));
        assertTrue(ok2);
        assertEq(raw2, raw);
    }

    function test_GetSessions_ShapeUnchangedAndLinkFree() public {
        _create(PRICE, 5, false);
        _create(PRICE, 5, true);
        (bool ok, bytes memory raw) = address(pass).staticcall(abi.encodeCall(ExpertPass.getSessions, (1, 10)));
        assertTrue(ok);
        ExpertPass.Session[] memory list = abi.decode(raw, (ExpertPass.Session[]));
        assertEq(list.length, 2);
        assertEq(abi.encode(list), raw);
        assertEq(list[1].expert, expert);
        assertTrue(list[1].transferable);
        assertFalse(_contains(raw, bytes("example.com")));
        _set(1, LINK2);
        (, bytes memory raw2) = address(pass).staticcall(abi.encodeCall(ExpertPass.getSessions, (1, 10)));
        assertEq(raw2, raw);
        assertFalse(_contains(raw2, bytes("meet.example.org")));
    }

    // ---------- fuzz ----------

    function testFuzz_ValidLinksAcceptedAndRoundTrip(bool secure, uint16 extra, bytes1 fill) public {
        string memory prefix = secure ? "https://" : "http://";
        uint256 n = bound(uint256(extra), bytes(prefix).length, 512);
        bytes memory raw = bytes(_padded(prefix, n));
        for (uint256 i = bytes(prefix).length; i < n; ++i) raw[i] = fill;
        string memory link = string(raw);
        uint256 id = _createWith(link);
        assertEq(pass.getEventLink(id), link);
        _set(id, link);
        assertEq(pass.getEventLink(id), link);
    }

    function testFuzz_InvalidPrefixRejected(bytes calldata raw) public {
        vm.assume(raw.length <= 600);
        bool hasHttp = raw.length >= 7 && bytes7(raw[:7]) == bytes7("http://");
        bool hasHttps = raw.length >= 8 && bytes8(raw[:8]) == bytes8("https://");
        bool expectOk = raw.length >= 1 && raw.length <= 512 && (hasHttp || hasHttps);
        assertEq(_tryCreate(string(raw)), expectOk);
    }
}
