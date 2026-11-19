// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

/// @dev Shared helpers for the cover-URL suites. Contains no test functions.
abstract contract ExpertPassCoverBase is ExpertPassTestBase {
    event SessionCreated(uint256 indexed id, address indexed expert);
    event EventLinkUpdated(uint256 indexed id, address indexed expert);
    event CoverUrlUpdated(uint256 indexed id, address indexed expert);

    string internal constant COVER = "https://cdn.example.com/cover-a.png";
    string internal constant COVER2 = "https://cdn.example.com/cover-b.jpg";

    /// @dev `prefix` followed by 'a' padding up to exactly `n` bytes (prefix truncated if n is shorter).
    function _padded(string memory prefix, uint256 n) internal pure returns (string memory) {
        bytes memory p = bytes(prefix);
        bytes memory out = new bytes(n);
        for (uint256 i; i < n; ++i) out[i] = i < p.length ? p[i] : bytes1("a");
        return string(out);
    }

    function _createCover(string memory cover) internal returns (uint256 id) {
        vm.prank(expert);
        id = pass.createSession("Title", "Desc", 0, PRICE, 10, START, DUR, false, LINK, cover);
    }

    function _tryCreateCover(string memory cover) internal returns (bool ok) {
        vm.prank(expert);
        try pass.createSession("Title", "Desc", 0, PRICE, 10, START, DUR, false, LINK, cover) returns (uint256) {
            ok = true;
        } catch (bytes memory err) {
            assertEq(bytes4(err), ExpertPass.InvalidCoverUrl.selector, "wrong revert");
        }
    }

    function _setCover(uint256 id, string memory cover) internal {
        vm.prank(expert);
        pass.setCoverUrl(id, cover);
    }

    function _trySetCover(uint256 id, string memory cover) internal returns (bool ok) {
        vm.prank(expert);
        try pass.setCoverUrl(id, cover) {
            ok = true;
        } catch (bytes memory err) {
            assertEq(bytes4(err), ExpertPass.InvalidCoverUrl.selector, "wrong revert");
        }
    }

    function _expectSetRevert(uint256 id, string memory cover, bytes memory err) internal {
        vm.prank(expert);
        vm.expectRevert(err);
        pass.setCoverUrl(id, cover);
    }

    /// @dev Reference implementation of the cover-URL spec.
    function _specValid(bytes memory u) internal pure returns (bool) {
        if (u.length == 0) return true;
        if (u.length > 512 || u.length < 8) return false;
        bytes memory p = bytes("https://");
        for (uint256 i; i < 8; ++i) {
            if (u[i] != p[i]) return false;
        }
        return true;
    }
}
