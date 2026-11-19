// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ExpertPassTestBase} from "./ExpertPass.Base.t.sol";
import {ExpertPass} from "../ExpertPass.sol";

contract ExpertPassTransferTest is ExpertPassTestBase {
    event ParticipantRecorded(uint256 indexed id, address indexed participant);
    event CertificateMinted(uint256 indexed id, address indexed recipient);

    // ---------- soulbound vs transferable ----------

    function test_Soulbound_TransferReverts() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.SoulboundToken.selector);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        assertEq(pass.balanceOf(alice, id), 1);
        assertEq(pass.balanceOf(bob, id), 0);
    }

    function test_Soulbound_ApprovedOperatorTransferReverts() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.setApprovalForAll(bob, true);
        vm.prank(bob);
        vm.expectRevert(ExpertPass.SoulboundToken.selector);
        pass.safeTransferFrom(alice, carol, id, 1, "");
    }

    function test_Soulbound_BatchTransferReverts() public {
        uint256 a = _create(PRICE, 5, false);
        uint256 b = _create(PRICE, 5, false);
        _fundAndBuy(alice, a);
        _buy(alice, b);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
        uint256[] memory vals = new uint256[](2);
        vals[0] = 1;
        vals[1] = 1;
        vm.prank(alice);
        vm.expectRevert(ExpertPass.SoulboundToken.selector);
        pass.safeBatchTransferFrom(alice, bob, ids, vals, "");
    }

    function test_Transferable_SingleTransferWorks() public {
        uint256 id = _create(PRICE, 5, true);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        assertEq(pass.balanceOf(alice, id), 0);
        assertEq(pass.balanceOf(bob, id), 1);
    }

    function test_Transferable_OperatorTransferWorks() public {
        uint256 id = _create(PRICE, 5, true);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.setApprovalForAll(bob, true);
        vm.prank(bob);
        pass.safeTransferFrom(alice, carol, id, 1, "");
        assertEq(pass.balanceOf(carol, id), 1);
    }

    function test_Transferable_BatchTransferWorks() public {
        uint256 a = _create(PRICE, 5, true);
        uint256 b = _create(PRICE, 5, true);
        _fundAndBuy(alice, a);
        _buy(alice, b);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
        uint256[] memory vals = new uint256[](2);
        vals[0] = 1;
        vals[1] = 1;
        vm.prank(alice);
        pass.safeBatchTransferFrom(alice, bob, ids, vals, "");
        assertEq(pass.balanceOf(bob, a), 1);
        assertEq(pass.balanceOf(bob, b), 1);
        assertEq(pass.balanceOf(alice, a), 0);
        assertEq(pass.getParticipants(a, 0, 10).length, 2);
        assertEq(pass.getParticipants(b, 0, 10).length, 2);
    }

    function test_Batch_MixedTransferableAndSoulboundReverts() public {
        uint256 a = _create(PRICE, 5, true);
        uint256 b = _create(PRICE, 5, false);
        _fundAndBuy(alice, a);
        _buy(alice, b);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a;
        ids[1] = b;
        uint256[] memory vals = new uint256[](2);
        vals[0] = 1;
        vals[1] = 1;
        vm.prank(alice);
        vm.expectRevert(ExpertPass.SoulboundToken.selector);
        pass.safeBatchTransferFrom(alice, bob, ids, vals, "");
        assertEq(pass.balanceOf(alice, a), 1);
    }

    function test_Transfer_ReceiverCanStillBuyOwnTicket() public {
        uint256 id = _create(PRICE, 5, true);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, carol, id, 1, "");
        _fundAndBuy(carol, id);
        assertEq(pass.balanceOf(carol, id), 2);
        // and carol cannot buy a second time
        vm.prank(carol);
        vm.expectRevert(ExpertPass.AlreadyPurchased.selector);
        pass.buyTicket(id);
    }

    function test_Transfer_SellerCanRebuyAfterTransferStillBlocked() public {
        // alice's purchase flag is permanent even after she sold the ticket
        uint256 id = _create(PRICE, 5, true);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        vm.prank(alice);
        vm.expectRevert(ExpertPass.AlreadyPurchased.selector);
        pass.buyTicket(id);
    }

    function test_Burn_StillWorksOnSoulboundTicketViaRefund() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        pass.cancelSession(id);
        // soulbound ticket is burned by the automatic refund
        assertEq(pass.balanceOf(alice, id), 0);
        assertEq(usdc.balanceOf(address(pass)), 0);
    }

    // ---------- participants ----------

    function test_Participants_RecordedOnBuyAndTransfer() public {
        uint256 id = _create(PRICE, 5, true);
        _fundAndBuy(alice, id);
        vm.expectEmit(true, true, false, false, address(pass));
        emit ParticipantRecorded(id, bob);
        vm.prank(alice);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        assertEq(pass.participantCount(id), 2);
        address[] memory p = pass.getParticipants(id, 0, 10);
        assertEq(p[0], alice);
        assertEq(p[1], bob);
        assertEq(pass.participants(id, 1), bob);
    }

    function test_Participants_NoDuplicates() public {
        uint256 id = _create(PRICE, 5, true);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        vm.prank(bob);
        pass.safeTransferFrom(bob, alice, id, 1, "");
        assertEq(pass.participantCount(id), 2);
    }

    function test_Participants_ZeroValueTransferDoesNotRecord() public {
        uint256 id = _create(PRICE, 5, true);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, carol, id, 0, "");
        assertEq(pass.participantCount(id), 1);
    }

    function test_Participants_RefundDoesNotRemoveHistory() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        pass.cancelSession(id);
        assertEq(pass.balanceOf(alice, id), 0);
        assertEq(pass.participantCount(id), 1);
    }

    function test_Participants_PaginationBounds() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _fundAndBuy(bob, id);
        _fundAndBuy(carol, id);
        assertEq(pass.getParticipants(id, 1, 1).length, 1);
        assertEq(pass.getParticipants(id, 1, 1)[0], bob);
        assertEq(pass.getParticipants(id, 2, 10).length, 1);
        assertEq(pass.getParticipants(id, 3, 10).length, 0);
        assertEq(pass.getParticipants(id, 0, 0).length, 0);
    }

    // ---------- mintCertificates ----------

    function _single(address a) internal pure returns (address[] memory r) {
        r = new address[](1);
        r[0] = a;
    }

    function test_Certificates_MintsToHolderAfterEndAndEmits() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _toEnd();
        uint256 certId = pass.certificateId(id);
        assertEq(certId, pass.CERT_OFFSET() + id);
        vm.expectEmit(true, true, false, false, address(pass));
        emit CertificateMinted(id, alice);
        vm.prank(expert);
        pass.mintCertificates(id, _single(alice));
        assertEq(pass.balanceOf(alice, certId), 1);
        // ticket stays
        assertEq(pass.balanceOf(alice, id), 1);
    }

    function test_Certificates_RevertsBeforeEnd() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.warp(START + 1);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.SessionNotEnded.selector);
        pass.mintCertificates(id, _single(alice));
    }

    function test_Certificates_RevertsNotExpert() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _toEnd();
        vm.prank(alice);
        vm.expectRevert(ExpertPass.NotSessionExpert.selector);
        pass.mintCertificates(id, _single(alice));
    }

    function test_Certificates_RevertsWhenCancelled() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        vm.prank(expert);
        pass.cancelSession(id);
        _toEnd();
        vm.prank(expert);
        vm.expectRevert(ExpertPass.SessionCancelled.selector);
        pass.mintCertificates(id, _single(alice));
    }

    function test_Certificates_RevertsUnknownSession() public {
        vm.prank(expert);
        vm.expectRevert(abi.encodeWithSelector(ExpertPass.SessionNotFound.selector, 4));
        pass.mintCertificates(4, _single(alice));
    }

    function test_Certificates_SkipsNonHoldersAndDuplicates() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _fundAndBuy(bob, id);
        _toEnd();
        address[] memory r = new address[](5);
        r[0] = alice;
        r[1] = carol; // no ticket
        r[2] = alice; // duplicate in same call
        r[3] = bob;
        r[4] = address(0xdead); // no ticket
        vm.prank(expert);
        pass.mintCertificates(id, r);
        uint256 certId = pass.certificateId(id);
        assertEq(pass.balanceOf(alice, certId), 1);
        assertEq(pass.balanceOf(bob, certId), 1);
        assertEq(pass.balanceOf(carol, certId), 0);
        assertEq(pass.balanceOf(address(0xdead), certId), 0);

        // second call with existing certificate holders is a silent no-op
        vm.prank(expert);
        pass.mintCertificates(id, r);
        assertEq(pass.balanceOf(alice, certId), 1);
    }

    function test_Certificates_TicketTransferredAwaySkipsOriginalBuyer() public {
        uint256 id = _create(PRICE, 5, true);
        _fundAndBuy(alice, id);
        vm.prank(alice);
        pass.safeTransferFrom(alice, bob, id, 1, "");
        _toEnd();
        address[] memory r = new address[](2);
        r[0] = alice;
        r[1] = bob;
        vm.prank(expert);
        pass.mintCertificates(id, r);
        uint256 certId = pass.certificateId(id);
        assertEq(pass.balanceOf(alice, certId), 0);
        assertEq(pass.balanceOf(bob, certId), 1);
    }

    function test_Certificates_MaxHundredRecipients() public {
        uint256 id = _create(PRICE, 5, false);
        _toEnd();
        vm.warp(_endTime());
        address[] memory r = new address[](100);
        for (uint256 i; i < 100; ++i) r[i] = address(uint160(0x1000 + i));
        vm.prank(expert);
        pass.mintCertificates(id, r); // ok, all skipped as non-holders

        address[] memory r2 = new address[](101);
        vm.prank(expert);
        vm.expectRevert(ExpertPass.TooManyRecipients.selector);
        pass.mintCertificates(id, r2);
    }

    function test_Certificates_EmptyArrayIsNoop() public {
        uint256 id = _create(PRICE, 5, false);
        _toEnd();
        vm.prank(expert);
        pass.mintCertificates(id, new address[](0));
    }

    function test_Certificates_AlwaysSoulbound() public {
        uint256 id = _create(PRICE, 5, true); // even for transferable tickets
        _fundAndBuy(alice, id);
        _toEnd();
        vm.prank(expert);
        pass.mintCertificates(id, _single(alice));
        uint256 certId = pass.certificateId(id);
        vm.prank(alice);
        vm.expectRevert(ExpertPass.SoulboundToken.selector);
        pass.safeTransferFrom(alice, bob, certId, 1, "");

        uint256[] memory ids = new uint256[](1);
        ids[0] = certId;
        uint256[] memory vals = new uint256[](1);
        vals[0] = 1;
        vm.prank(alice);
        vm.expectRevert(ExpertPass.SoulboundToken.selector);
        pass.safeBatchTransferFrom(alice, bob, ids, vals, "");
    }

    function test_Certificates_DoNotAffectParticipants() public {
        uint256 id = _create(PRICE, 5, false);
        _fundAndBuy(alice, id);
        _toEnd();
        vm.prank(expert);
        pass.mintCertificates(id, _single(alice));
        assertEq(pass.participantCount(id), 1);
    }

    function test_CertificateId_RevertsOutOfNamespace() public {
        vm.expectRevert(ExpertPass.InvalidSessionId.selector);
        pass.certificateId(0);
        uint256 off = pass.CERT_OFFSET();
        vm.expectRevert(ExpertPass.InvalidSessionId.selector);
        pass.certificateId(off);
    }

    function test_Certificates_RejectingReceiverBlocksMint() public {
        // a contract holder that cannot receive ERC-1155 would revert the batch (documented behaviour)
        uint256 id = _create(0, 5, true);
        _buy(alice, id);
        vm.prank(alice);
        // alice -> usdc contract (no receiver) cannot be transferred at all
        vm.expectRevert();
        pass.safeTransferFrom(alice, address(usdc), id, 1, "");
    }
}
