// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassCoverBase} from "./ExpertPass.CoverBase.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

contract ExpertPassCoverAccountingTest is ExpertPassCoverBase {
    // ---------- uri unchanged ----------

    function test_Uri_UnchangedByCoverChanges() public {
        uint256 id = _createCover(COVER);
        uint256 certId = pass.certificateId(id);
        string memory t0 = pass.uri(id);
        string memory c0 = pass.uri(certId);
        _setCover(id, COVER2);
        assertEq(pass.uri(id), t0);
        assertEq(pass.uri(certId), c0);
        _setCover(id, "");
        assertEq(pass.uri(id), t0);
        assertEq(pass.uri(certId), c0);
    }

    function test_Uri_IdenticalWithAndWithoutCover() public {
        uint256 a = _createCover(COVER);
        uint256 b = _createCover("");
        assertEq(pass.uri(a), pass.uri(b));
        assertEq(pass.uri(pass.certificateId(a)), pass.uri(pass.certificateId(b)));
    }

    function test_Uri_DoesNotContainCoverUrl() public {
        uint256 id = _createCover(COVER);
        bytes memory u = bytes(pass.uri(id));
        bytes memory needle = bytes(COVER);
        // raw (non-base64) cover text must not appear in the data URI
        for (uint256 i; i + needle.length <= u.length; ++i) {
            bool hit = true;
            for (uint256 j; j < needle.length; ++j) {
                if (u[i + j] != needle[j]) {
                    hit = false;
                    break;
                }
            }
            assertFalse(hit, "cover leaked into uri");
        }
    }

    // ---------- getSession / getSessions shape ----------

    function test_GetSession_ShapeUnchanged() public {
        vm.prank(expert);
        uint256 id = pass.createSession("My Title", "My Desc", 3, 25e6, 50, START, DUR, true, LINK, COVER);
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
        assertEq(s.refunded, 0);
        assertEq(s.price, 25e6);
        assertEq(s.title, "My Title");
        assertEq(s.description, "My Desc");
        // abi layout: 13 head slots + 2 dynamic strings, no cover member
        bytes memory raw = abi.encode(s);
        ExpertPass.Session memory back = abi.decode(raw, (ExpertPass.Session));
        assertEq(keccak256(abi.encode(back)), keccak256(raw));
    }

    function test_GetSession_RawReturnIdenticalAcrossCoverRotation() public {
        uint256 id = _createCover(COVER);
        bytes memory before = abi.encode(pass.getSession(id));
        _setCover(id, COVER2);
        assertEq(abi.encode(pass.getSession(id)), before);
        _setCover(id, "");
        assertEq(abi.encode(pass.getSession(id)), before);
    }

    function test_GetSession_IdenticalWithAndWithoutCover() public {
        uint256 a = _createCover(COVER);
        uint256 b = _createCover("");
        assertEq(abi.encode(pass.getSession(a)), abi.encode(pass.getSession(b)));
    }

    function test_GetSessions_ShapeAndStabilityAcrossCoverRotation() public {
        _createCover(COVER);
        _createCover("");
        _createCover(COVER2);
        ExpertPass.Session[] memory before = pass.getSessions(1, 10);
        assertEq(before.length, 3);
        assertEq(before[2].title, "Title");
        assertEq(before[2].expert, expert);
        bytes memory enc = abi.encode(before);
        _setCover(1, COVER2);
        _setCover(2, COVER);
        _setCover(3, "");
        assertEq(abi.encode(pass.getSessions(1, 10)), enc);
        assertEq(pass.getSessions(0, 2).length, 2);
        assertEq(pass.getSessions(4, 2).length, 0);
    }

    // ---------- accounting unaffected ----------

    function _usdc(address a) internal view returns (uint256) {
        return usdc.balanceOf(a);
    }

    /// @dev Escrow, payout and fees are identical for a rotating session and an untouched twin.
    function test_Payout_UnaffectedByCoverRotation() public {
        uint256 rot = _createCover(COVER);
        uint256 twin = _createCover(COVER);
        _fundAndBuy(alice, rot);
        _fundAndBuy(alice, twin);
        _setCover(rot, COVER2);
        _fundAndBuy(bob, rot);
        _fundAndBuy(bob, twin);
        _setCover(rot, "");
        _fundAndBuy(carol, rot);
        _fundAndBuy(carol, twin);
        // escrow = sum of price * sold for both sessions, regardless of rotation
        assertEq(_usdc(address(pass)), uint256(PRICE) * 6);
        _setCover(rot, COVER);
        vm.warp(START);
        _setCover(rot, COVER2);
        _toEnd();

        uint256 gross = uint256(PRICE) * 3;
        uint256 fee = gross * FEE / 10000;
        uint256 expertBefore = _usdc(expert);

        vm.prank(expert);
        pass.withdrawProceeds(rot);
        assertEq(_usdc(expert) - expertBefore, gross - fee);
        assertEq(pass.accruedFees(), fee);

        vm.prank(expert);
        pass.withdrawProceeds(twin);
        assertEq(_usdc(expert) - expertBefore, 2 * (gross - fee));
        assertEq(pass.accruedFees(), 2 * fee);
        assertEq(_usdc(address(pass)), pass.accruedFees());

        vm.prank(owner);
        pass.withdrawFees(treasury);
        assertEq(_usdc(treasury), 2 * fee);
        assertEq(_usdc(address(pass)), 0);
    }

    function test_Payout_CoverUrlStillReadableAfterPayout() public {
        uint256 id = _createCover(COVER);
        _fundAndBuy(alice, id);
        _setCover(id, COVER2);
        _toEnd();
        vm.prank(expert);
        pass.withdrawProceeds(id);
        assertEq(pass.getCoverUrl(id), COVER2);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.SessionAlreadyEnded.selector);
        pass.setCoverUrl(id, COVER);
    }

    function test_Refund_UnaffectedByCoverRotation() public {
        uint256 id = _createCover(COVER);
        _fundAndBuy(alice, id);
        _setCover(id, COVER2);
        _fundAndBuy(bob, id);
        _setCover(id, "");
        _fundAndBuy(carol, id);
        assertEq(_usdc(address(pass)), uint256(PRICE) * 3);
        uint256 aliceBal = _usdc(alice);
        uint256 bobBal = _usdc(bob);
        uint256 carolBal = _usdc(carol);

        _cancel(id);
        // automatic refunds (3 <= AUTO_REFUND_LIMIT) return the full price
        assertEq(_usdc(alice), aliceBal + PRICE);
        assertEq(_usdc(bob), bobBal + PRICE);
        assertEq(_usdc(carol), carolBal + PRICE);
        assertEq(_usdc(address(pass)), 0);
        assertEq(pass.getSession(id).refunded, 3);
        assertEq(pass.balanceOf(alice, id), 0);
        // cover remains readable on a cancelled session but cannot be changed
        assertEq(pass.getCoverUrl(id), "");
        _expectSetRevert(id, COVER, abi.encodeWithSelector(ExpertPass.SessionCancelled.selector));
    }

    function test_Refund_TransferableSessionUnaffectedByCoverRotation() public {
        // Transferable session: cover set right after creation and rotated after a sale
        uint256 id = _create(PRICE, 5, true);
        _setCover(id, COVER);
        _fundAndBuy(alice, id);
        _setCover(id, COVER2);
        uint256 before = _usdc(alice);
        _cancel(id);
        assertEq(_usdc(alice), before + PRICE);
        assertEq(_usdc(address(pass)), 0);
        assertEq(pass.refundedAmount(id, alice), PRICE);
    }

    function test_Purchase_StillWorksWithCoverStates() public {
        uint256 withCover = _createCover(COVER);
        uint256 noCover = _createCover("");
        _fundAndBuy(alice, withCover);
        _fundAndBuy(alice, noCover);
        assertEq(pass.balanceOf(alice, withCover), 1);
        assertEq(pass.balanceOf(alice, noCover), 1);
        assertEq(_usdc(address(pass)), uint256(PRICE) * 2);
    }

    /// @dev Fuzz: arbitrary buyers/rotations never change what the session owes.
    /// forge-config: default.fuzz.runs = 64
    function testFuzz_Accounting_IndependentOfCoverRotation(uint8 buyers, uint8 rotations, uint96 price) public {
        uint256 n = bound(buyers, 1, 20);
        uint256 r = bound(rotations, 0, 6);
        uint128 p = uint128(bound(price, 1, 1_000e6));
        vm.prank(expert);
        uint256 id = pass.createSession("T", "D", 0, p, 100, START, DUR, false, LINK, COVER);
        for (uint256 i; i < n; ++i) {
            _buyMany(id, i, 1, uint256(p));
            if (i < r) _setCover(id, i % 2 == 0 ? COVER2 : "");
        }
        assertEq(_usdc(address(pass)), uint256(p) * n);
        assertEq(pass.getSession(id).sold, n);

        _toEnd();
        uint256 gross = uint256(p) * n;
        uint256 fee = gross * FEE / 10000;
        uint256 before = _usdc(expert);
        vm.prank(expert);
        pass.withdrawProceeds(id);
        assertEq(_usdc(expert) - before, gross - fee);
        assertEq(pass.accruedFees(), fee);
        assertEq(_usdc(address(pass)), fee);
    }

    /// forge-config: default.fuzz.runs = 64
    function testFuzz_Refund_IndependentOfCoverRotation(uint8 buyers, uint8 rotations, uint96 price) public {
        uint256 n = bound(buyers, 1, 20);
        uint256 r = bound(rotations, 0, 6);
        uint128 p = uint128(bound(price, 1, 1_000e6));
        vm.prank(expert);
        uint256 id = pass.createSession("T", "D", 0, p, 100, START, DUR, false, LINK, "");
        for (uint256 i; i < n; ++i) {
            _buyMany(id, i, 1, uint256(p));
            if (i < r) _setCover(id, i % 2 == 0 ? COVER : "");
        }
        assertEq(_usdc(address(pass)), uint256(p) * n);
        _cancel(id);
        assertEq(_usdc(address(pass)), 0);
        for (uint256 i; i < n; ++i) {
            assertEq(_usdc(_buyer(i)), uint256(p));
            assertEq(pass.balanceOf(_buyer(i), id), 0);
        }
        assertEq(pass.getSession(id).refunded, n);
    }
}
