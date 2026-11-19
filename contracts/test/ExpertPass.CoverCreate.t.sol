// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {ExpertPassCoverBase} from "./ExpertPass.CoverBase.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

contract ExpertPassCoverCreateTest is ExpertPassCoverBase {
    // ---------- creation: storage & events ----------

    function test_Create_EmptyCoverStoresEmpty() public {
        uint256 id = _createCover("");
        assertEq(pass.getCoverUrl(id), "");
    }

    function test_Create_StoresCover() public {
        uint256 id = _createCover(COVER);
        assertEq(pass.getCoverUrl(id), COVER);
        assertEq(pass.getEventLink(id), LINK);
    }

    function test_Create_EmptyCoverEmitsOnlyTwoEvents() public {
        vm.recordLogs();
        _createCover("");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(logs[0].topics[0], ExpertPass.SessionCreated.selector);
        assertEq(logs[1].topics[0], ExpertPass.EventLinkUpdated.selector);
    }

    function test_Create_WithCoverEmitsThreeInOrderWithoutUrlInData() public {
        vm.recordLogs();
        _createCover(COVER);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 3);
        assertEq(logs[0].topics[0], ExpertPass.SessionCreated.selector);
        assertEq(logs[1].topics[0], ExpertPass.EventLinkUpdated.selector);
        assertEq(logs[2].topics[0], ExpertPass.CoverUrlUpdated.selector);
        for (uint256 i; i < logs.length; ++i) {
            assertEq(logs[i].emitter, address(pass));
            assertEq(logs[i].topics.length, 3);
            assertEq(logs[i].topics[1], bytes32(uint256(1)));
            assertEq(logs[i].topics[2], bytes32(uint256(uint160(expert))));
            assertEq(logs[i].data.length, 0, "no log data");
        }
    }

    function test_Create_WithCoverExpectEmit() public {
        vm.expectEmit(true, true, false, true, address(pass));
        emit SessionCreated(1, expert);
        vm.expectEmit(true, true, false, true, address(pass));
        emit EventLinkUpdated(1, expert);
        vm.expectEmit(true, true, false, true, address(pass));
        emit CoverUrlUpdated(1, expert);
        _createCover(COVER);
    }

    function test_Create_BaseHelperHasNoCover() public {
        uint256 id = _create(PRICE, 5, false);
        assertEq(pass.getCoverUrl(id), "");
    }

    function test_Create_CoverIsPerSession() public {
        uint256 a = _createCover(COVER);
        uint256 b = _createCover("");
        uint256 c = _createCover(COVER2);
        assertEq(pass.getCoverUrl(a), COVER);
        assertEq(pass.getCoverUrl(b), "");
        assertEq(pass.getCoverUrl(c), COVER2);
    }

    // ---------- creation: validation ----------

    function test_Create_Accepts512Bytes() public {
        string memory url = _padded("https://", 512);
        assertEq(bytes(url).length, 512);
        uint256 id = _createCover(url);
        assertEq(pass.getCoverUrl(id), url);
    }

    function test_Create_Rejects513Bytes() public {
        string memory url = _padded("https://", 513);
        assertEq(bytes(url).length, 513);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.InvalidCoverUrl.selector);
        pass.createSession("t", "d", 0, PRICE, 1, START, DUR, false, LINK, url);
        assertEq(pass.sessionCount(), 0);
    }

    function test_Create_AcceptsBareHttpsPrefix() public {
        uint256 id = _createCover("https://");
        assertEq(pass.getCoverUrl(id), "https://");
    }

    function test_Create_RejectsBadPrefixes() public {
        string[12] memory bad = [
            "http://example.com/a.png",
            "http://",
            "HTTPS://example.com/a.png",
            "Https://example.com/a.png",
            "ftp://example.com/a.png",
            "data:image/png;base64,AAAA",
            "javascript:alert(1)",
            "https:/example.com/a.png",
            "https:/",
            " https://example.com/a.png",
            "example.com/a.png",
            "h"
        ];
        for (uint256 i; i < bad.length; ++i) {
            assertFalse(_tryCreateCover(bad[i]), bad[i]);
        }
        assertEq(pass.sessionCount(), 0);
    }

    function test_Create_RevertsWithInvalidCoverUrlSelector() public {
        vm.prank(expert);
        vm.expectRevert(ExpertPass.InvalidCoverUrl.selector);
        pass.createSession("t", "d", 0, PRICE, 1, START, DUR, false, LINK, "http://example.com/a.png");
    }

    function test_Create_InvalidCoverDoesNotConsumeId() public {
        assertFalse(_tryCreateCover("ftp://x"));
        assertEq(_createCover(COVER), 1);
        assertEq(pass.sessionCount(), 1);
    }

    function test_Create_InvalidEventLinkStillRevertsWithEventLinkError() public {
        vm.prank(expert);
        vm.expectRevert(ExpertPass.InvalidEventLink.selector);
        pass.createSession("t", "d", 0, PRICE, 1, START, DUR, false, "ftp://x", COVER);
    }

    // ---------- fuzz: validation vs spec ----------

    /// @dev Structured fuzz: one of several prefixes padded/truncated to a fuzzed length.
    function _structured(uint8 sel, uint16 len) internal pure returns (string memory) {
        string[10] memory prefixes = [
            "https://", "http://", "HTTPS://", "ftp://", "data:", "javascript:", "https:/", "", "Https://", "https://x"
        ];
        return _padded(prefixes[sel % prefixes.length], uint256(len) % 700);
    }

    function testFuzz_Create_AcceptRejectMatchesSpec(uint8 sel, uint16 len) public {
        string memory url = _structured(sel, len);
        bool expected = _specValid(bytes(url));
        assertEq(_tryCreateCover(url), expected);
        assertEq(pass.sessionCount(), expected ? 1 : 0);
        if (expected) assertEq(pass.getCoverUrl(1), url);
    }

    function testFuzz_Set_AcceptRejectMatchesSpec(uint8 sel, uint16 len) public {
        uint256 id = _createCover(COVER);
        string memory url = _structured(sel, len);
        bool expected = _specValid(bytes(url));
        assertEq(_trySetCover(id, url), expected);
        assertEq(pass.getCoverUrl(id), expected ? url : COVER);
    }

    function testFuzz_Create_ArbitraryStringMatchesSpec(string calldata url) public {
        bool expected = _specValid(bytes(url));
        assertEq(_tryCreateCover(url), expected);
    }

    function testFuzz_Set_ArbitraryStringMatchesSpec(string calldata url) public {
        uint256 id = _createCover(COVER);
        bool expected = _specValid(bytes(url));
        assertEq(_trySetCover(id, url), expected);
        assertEq(pass.getCoverUrl(id), expected ? url : COVER);
    }
}
