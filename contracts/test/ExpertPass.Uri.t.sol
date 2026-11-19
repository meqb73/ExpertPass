// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

contract ExpertPassUriTest is ExpertPassTestBase {
    string internal constant JSON_PREFIX = "data:application/json;base64,";
    string internal constant SVG_PREFIX = "data:image/svg+xml;base64,";

    function _val(bytes1 c) internal pure returns (uint256) {
        uint8 x = uint8(c);
        if (x >= 65 && x <= 90) return x - 65;
        if (x >= 97 && x <= 122) return x - 97 + 26;
        if (x >= 48 && x <= 57) return x - 48 + 52;
        if (x == 43) return 62;
        if (x == 47) return 63;
        return 0; // '='
    }

    function _b64decode(bytes memory d) internal pure returns (bytes memory out) {
        uint256 n = d.length;
        require(n % 4 == 0 && n > 0, "bad b64");
        uint256 pad = d[n - 1] == "=" ? (d[n - 2] == "=" ? 2 : 1) : 0;
        out = new bytes(n / 4 * 3 - pad);
        uint256 o;
        for (uint256 i; i < n; i += 4) {
            uint256 v;
            for (uint256 j; j < 4; ++j) v = (v << 6) | _val(d[i + j]);
            for (uint256 k; k < 3; ++k) {
                if (o < out.length) out[o++] = bytes1(uint8(v >> (16 - 8 * k)));
            }
        }
    }

    function _slice(bytes memory b, uint256 from) internal pure returns (bytes memory r) {
        r = new bytes(b.length - from);
        for (uint256 i; i < r.length; ++i) r[i] = b[from + i];
    }

    function _decodeJson(string memory uri) internal pure returns (string memory) {
        bytes memory b = bytes(uri);
        bytes memory prefix = bytes(JSON_PREFIX);
        for (uint256 i; i < prefix.length; ++i) assertEq(b[i], prefix[i]);
        return string(_b64decode(_slice(b, prefix.length)));
    }

    function test_Uri_TicketMetadataDecodes() public {
        vm.prank(expert);
        uint256 id = pass.createSession("Solidity 101", "d", 2, PRICE, 5, START, DUR, false, LINK, "");
        string memory json = _decodeJson(pass.uri(id));
        assertEq(vm.parseJsonString(json, ".name"), "Solidity 101 - Ticket");
        assertEq(vm.parseJsonString(json, ".attributes[0].trait_type"), "Category");
        assertEq(vm.parseJsonString(json, ".attributes[0].value"), "Business & Finance");
        assertEq(vm.parseJsonUint(json, ".attributes[1].value"), uint256(START));
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "Ticket");
    }

    function test_Uri_CertificateMetadata() public {
        uint256 id = _create(PRICE, 5, false);
        string memory json = _decodeJson(pass.uri(pass.certificateId(id)));
        assertEq(vm.parseJsonString(json, ".name"), "Title - Attendance Certificate");
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "Attendance Certificate");
        assertEq(vm.parseJsonString(json, ".attributes[0].value"), "Technology & Engineering");
    }

    function test_Uri_ImageIsDecodableSvgDataUri() public {
        uint256 id = _create(PRICE, 5, false);
        string memory json = _decodeJson(pass.uri(id));
        bytes memory img = bytes(vm.parseJsonString(json, ".image"));
        bytes memory prefix = bytes(SVG_PREFIX);
        for (uint256 i; i < prefix.length; ++i) assertEq(img[i], prefix[i]);
        bytes memory svg = _b64decode(_slice(img, prefix.length));
        assertEq(svg[0], bytes1("<"));
        assertEq(svg[1], bytes1("s"));
    }

    function test_Uri_EscapesTitleSoJsonStaysValid() public {
        vm.prank(expert);
        uint256 id = pass.createSession('He said "hi"\\', "d", 0, PRICE, 5, START, DUR, false, LINK, "");
        string memory json = _decodeJson(pass.uri(id));
        assertEq(vm.parseJsonString(json, ".name"), 'He said "hi"\\ - Ticket');
    }

    function test_Uri_ReflectsUpdatedMetadata() public {
        uint256 id = _create(PRICE, 5, false);
        vm.prank(expert);
        pass.updateSession(id, "Renamed", "d", 7, START, DUR);
        string memory json = _decodeJson(pass.uri(id));
        assertEq(vm.parseJsonString(json, ".name"), "Renamed - Ticket");
        assertEq(vm.parseJsonString(json, ".attributes[0].value"), "Other");
    }

    function test_Uri_AllCategoriesRender() public {
        for (uint8 c; c < 8; ++c) {
            vm.prank(expert);
            uint256 id = pass.createSession("t", "d", c, PRICE, 5, START, DUR, false, LINK, "");
            _decodeJson(pass.uri(id)); // must decode + not revert
        }
    }

    function _has(bytes memory hay, bytes memory needle) internal pure returns (bool) {
        if (hay.length < needle.length) return false;
        for (uint256 i; i + needle.length <= hay.length; ++i) {
            bool ok = true;
            for (uint256 j; j < needle.length && ok; ++j) ok = hay[i + j] == needle[j];
            if (ok) return true;
        }
        return false;
    }

    function test_Uri_NeverContainsEventLink() public {
        string memory rotated = "https://meet.example.org/rotated-room-42";
        uint256 id = _create(PRICE, 5, false);
        for (uint256 round; round < 2; ++round) {
            if (round == 1) {
                vm.prank(expert);
                pass.setEventLink(id, rotated);
            }
            uint256[2] memory ids = [id, pass.certificateId(id)];
            for (uint256 k; k < 2; ++k) {
                string memory uriStr = pass.uri(ids[k]);
                string memory json = _decodeJson(uriStr);
                bytes memory img = bytes(vm.parseJsonString(json, ".image"));
                bytes memory svg = _b64decode(_slice(img, bytes(SVG_PREFIX).length));
                bytes[2] memory needles = [bytes("example.com/session"), bytes("meet.example.org")];
                for (uint256 n; n < 2; ++n) {
                    assertFalse(_has(bytes(json), needles[n]), "link in json");
                    assertFalse(_has(svg, needles[n]), "link in svg");
                    assertFalse(_has(bytes(uriStr), needles[n]), "link in raw uri");
                }
            }
        }
    }

    function test_Uri_UnchangedByLinkRotation() public {
        uint256 id = _create(PRICE, 5, false);
        string memory before_ = pass.uri(id);
        vm.prank(expert);
        pass.setEventLink(id, "http://rotated.example.net/x");
        assertEq(pass.uri(id), before_);
    }

    function test_Uri_RevertsForNonexistentIds() public {
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 99));
        pass.uri(99);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 0));
        pass.uri(0);
        uint256 off = pass.CERT_OFFSET();
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 99));
        pass.uri(off + 99);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 0));
        pass.uri(off);
    }

    function test_Uri_CertificateOfExistingSessionOk() public {
        uint256 id = _create(PRICE, 5, false);
        assertGt(bytes(pass.uri(pass.CERT_OFFSET() + id)).length, 0);
    }

    function test_SupportsInterface() public view {
        assertTrue(pass.supportsInterface(0xd9b67a26)); // ERC1155
        assertTrue(pass.supportsInterface(0x0e89341c)); // ERC1155MetadataURI
        assertTrue(pass.supportsInterface(0x01ffc9a7)); // ERC165
        assertFalse(pass.supportsInterface(0xffffffff));
    }
}
