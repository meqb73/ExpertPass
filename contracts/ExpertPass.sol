// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title ExpertPass
/// @notice USDC-escrowed session tickets and soulbound attendance certificates.
/// @dev Targets Solidity 0.8.28, Cancun and OpenZeppelin Contracts 5.6.1.
///      Prices are raw six-decimal USDC ERC-20 amounts, not native gas amounts.
///      WARNING: Event links are PUBLIC CHAIN DATA, readable by anyone via storage,
///      calldata or getEventLink. App-only display to ticket holders and the expert
///      is a soft gate, NOT confidentiality or onchain access control.
///      The configured token must be canonical, non-rebasing, six-decimal USDC.
///      No receive/fallback or payable functions are provided; forced native funds
///      cannot be prevented and are not part of the ERC-20 escrow accounting.
contract ExpertPass is ERC1155, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Strings for uint256;

    uint16 public constant MAX_FEE_BPS = 1000;
    uint256 public constant CERT_OFFSET = 1 << 128;
    uint256 private constant PAGE_LIMIT = 200;

    /// @notice Maximum number of participants examined automatically during cancellation.
    uint256 public constant AUTO_REFUND_LIMIT = 40;

    struct Expert {
        string name;
        string bio;
        bool registered;
    }

    struct Session {
        address expert;
        uint8 category;
        bool transferable;
        bool cancelled;
        bool paidOut;
        uint16 feeBps;
        uint32 duration;
        uint64 startTime;
        uint32 supply;
        uint32 sold;
        uint32 refunded;
        uint128 price;
        string title;
        string description;
    }

    IERC20 public immutable usdc;
    uint16 public feeBps;
    uint256 public sessionCount;
    uint256 public accruedFees;
    mapping(address expert => Expert) public experts;
    mapping(uint256 id => Session) private _sessions;
    mapping(uint256 id => mapping(address buyer => bool)) public purchased;
    mapping(uint256 id => address[]) public participants;
    mapping(uint256 id => mapping(address participant => bool)) private _participantSeen;

    /// @notice Index of the next historical participant to examine for automatic refunds.
    /// @dev Advances even when a holder has no tickets or its USDC transfer fails.
    mapping(uint256 id => uint256) public refundCursor;

    /// @notice Cumulative raw USDC refunded to each holder through automatic and pull refunds.
    mapping(uint256 id => mapping(address holder => uint256)) public refundedAmount;

    /// @dev PUBLIC CHAIN DATA despite private visibility; never treat event links as secrets.
    mapping(uint256 id => string) private _eventLinks;

    /// @dev Public cover image URLs; empty means no cover.
    mapping(uint256 id => string) private _coverUrls;

    error ZeroAddress();
    error FeeTooHigh();
    error InvalidName();
    error InvalidBio();
    error ExpertNotRegistered();
    error InvalidTitle();
    error InvalidDescription();
    error InvalidEventLink();
    error InvalidCoverUrl();
    error SessionAlreadyEnded();
    error InvalidCategory();
    error InvalidSupply();
    error InvalidDuration();
    error InvalidStartTime();
    error InvalidSessionId();
    error SessionNotFound(uint256 id);
    error NotSessionExpert();
    error SessionCancelled();
    error SessionNotCancelled();
    error SessionAlreadyStarted();
    error SessionNotEnded();
    error SessionAlreadyPaidOut();
    error SoldOut();
    error AlreadyPurchased();
    error ExpertCannotPurchase();
    error NoTicket();
    error TooManyRecipients();
    error SoulboundToken();
    error ScheduleLocked();
    error UnexpectedUSDCAmount();

    /// @notice The requested refund batch size is outside the inclusive range 1..100.
    error InvalidLimit();

    event ExpertRegistered(address indexed expert, string name);
    event ExpertProfileUpdated(address indexed expert, string name, string bio);
    event SessionCreated(uint256 indexed id, address indexed expert);
    event EventLinkUpdated(uint256 indexed id, address indexed expert);
    event CoverUrlUpdated(uint256 indexed id, address indexed expert);
    event SessionUpdated(uint256 indexed id);
    event SessionCancelledEvent(uint256 indexed id);
    event TicketPurchased(uint256 indexed id, address indexed buyer, uint256 price);
    /// @notice Emitted when tickets are burned and their full price refunded to a holder.
    /// @param id Cancelled session ID.
    /// @param holder Holder receiving the refund.
    /// @param price Total raw USDC refunded to this holder by this operation, not a per-ticket
    ///              price for automatic refunds or the lifetime cumulative refundedAmount.
    event TicketRefunded(uint256 indexed id, address indexed holder, uint256 price);
    event ProceedsWithdrawn(uint256 indexed id, address indexed expert, uint256 net, uint256 fee);
    event FeesWithdrawn(address indexed to, uint256 amount);
    event FeeBpsUpdated(uint16 previousFeeBps, uint16 newFeeBps);
    event CertificateMinted(uint256 indexed id, address indexed recipient);
    event ParticipantRecorded(uint256 indexed id, address indexed participant);

    /// @param usdc_ Canonical USDC ERC-20 address (six decimals), separate from native gas.
    /// @param initialOwner Initial two-step ownership administrator.
    /// @param initialFeeBps Fee for subsequently created sessions, at most 1000 bps.
    constructor(address usdc_, address initialOwner, uint16 initialFeeBps)
        ERC1155("")
        Ownable(initialOwner)
    {
        if (usdc_ == address(0)) revert ZeroAddress();
        if (initialFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        usdc = IERC20(usdc_);
        feeBps = initialFeeBps;
        emit FeeBpsUpdated(0, initialFeeBps);
    }

    /// @notice Register or replace the caller's public expert profile.
    /// @dev String limits are measured in bytes, not Unicode characters.
    function registerExpert(string calldata name, string calldata bio) external {
        if (bytes(name).length == 0 || bytes(name).length > 64) revert InvalidName();
        if (bytes(bio).length > 280) revert InvalidBio();
        experts[msg.sender] = Expert(name, bio, true);
        emit ExpertRegistered(msg.sender, name);
        emit ExpertProfileUpdated(msg.sender, name, bio);
    }

    /// @notice Create a session with immutable price, supply, transferability and fee.
    /// @dev Category values 0..7 follow the product category ordering.
    ///      WARNING: eventLink is PUBLIC CHAIN DATA, including in transaction calldata.
    ///      App-only display restrictions are a soft gate and provide no confidentiality.
    function createSession(
        string memory title,
        string memory description,
        uint8 category,
        uint128 price,
        uint32 supply,
        uint64 startTime,
        uint32 duration,
        bool transferable,
        string memory eventLink,
        string memory coverUrl
    ) external returns (uint256 id) {
        if (!experts[msg.sender].registered) revert ExpertNotRegistered();
        _validateSessionDetails(title, description, category, startTime, duration);
        if (supply == 0 || supply > 100000) revert InvalidSupply();
        _validateEventLink(eventLink);
        _validateCoverUrl(coverUrl);
        // Reserve the upper token-ID namespace exclusively for certificates.
        if (sessionCount >= CERT_OFFSET - 1) revert InvalidSessionId();
        id = ++sessionCount;
        Session storage session = _sessions[id];
        session.expert = msg.sender;
        session.category = category;
        session.transferable = transferable;
        session.feeBps = feeBps;
        session.duration = duration;
        session.startTime = startTime;
        session.supply = supply;
        session.price = price;
        session.title = title;
        session.description = description;
        _eventLinks[id] = eventLink;
        _coverUrls[id] = coverUrl;
        emit SessionCreated(id, msg.sender);
        emit EventLinkUpdated(id, msg.sender);
        if (bytes(coverUrl).length != 0) emit CoverUrlUpdated(id, msg.sender);
    }

    /// @notice Let the session expert rotate its event link until the session ends.
    /// @dev Independent of ticket sales and schedule locking; cancelled sessions cannot update.
    ///      WARNING: New and previous links are PUBLIC CHAIN DATA in storage/history/calldata.
    function setEventLink(uint256 id, string calldata eventLink) external {
        Session storage session = _requireSession(id);
        _requireExpert(session);
        if (session.cancelled) revert SessionCancelled();
        if (block.timestamp >= uint256(session.startTime) + session.duration) revert SessionAlreadyEnded();
        _validateEventLink(eventLink);
        _eventLinks[id] = eventLink;
        emit EventLinkUpdated(id, msg.sender);
    }

    /// @notice Let the session expert update or clear its public cover URL until the session ends.
    /// @dev Independent of ticket sales and schedule locking; cancelled sessions cannot update.
    function setCoverUrl(uint256 id, string calldata coverUrl) external {
        Session storage session = _requireSession(id);
        _requireExpert(session);
        if (session.cancelled) revert SessionCancelled();
        if (block.timestamp >= uint256(session.startTime) + session.duration) revert SessionAlreadyEnded();
        _validateCoverUrl(coverUrl);
        _coverUrls[id] = coverUrl;
        emit CoverUrlUpdated(id, msg.sender);
    }

    /// @notice Update editable session details before its currently scheduled start.
    function updateSession(
        uint256 id,
        string calldata title,
        string calldata description,
        uint8 category,
        uint64 startTime,
        uint32 duration
    ) external {
        Session storage session = _requireSession(id);
        _requireExpert(session);
        if (session.cancelled) revert SessionCancelled();
        if (block.timestamp >= session.startTime) revert SessionAlreadyStarted();
        // Once any ticket is sold the schedule is fixed: buyers have no exit besides cancellation,
        // so the expert cannot postpone payout (or move the session) unilaterally.
        if (session.sold != 0 && (startTime != session.startTime || duration != session.duration)) {
            revert ScheduleLocked();
        }
        if (session.sold == 0) {
            _validateSessionDetails(title, description, category, startTime, duration);
        } else {
            _validateSessionDetails(title, description, category, session.startTime + 1, duration);
        }
        session.title = title;
        session.description = description;
        session.category = category;
        session.startTime = startTime;
        session.duration = duration;
        emit SessionUpdated(id);
        emit URI(uri(id), id);
        uint256 certId = certificateId(id);
        emit URI(uri(certId), certId);
    }

    /// @notice Permanently cancel a session before it starts, enabling holder refunds.
    /// @dev Immediately examines up to AUTO_REFUND_LIMIT participants for automatic refunds.
    function cancelSession(uint256 id) external nonReentrant {
        Session storage session = _requireSession(id);
        _requireExpert(session);
        if (session.cancelled) revert SessionCancelled();
        if (block.timestamp >= session.startTime) revert SessionAlreadyStarted();
        session.cancelled = true;
        emit SessionCancelledEvent(id);
        _processRefunds(id, session, AUTO_REFUND_LIMIT);
    }

    /// @notice Continue automatic refunds for a cancelled session; anyone may call.
    /// @dev Failed transfers retain the holder's tickets and pull-refund rights.
    /// @param id Existing cancelled session ID.
    /// @param maxCount Maximum participants to examine, from 1 through 100 inclusive.
    /// @return processed Number of participants examined, including skipped holders.
    function processRefunds(uint256 id, uint256 maxCount) external nonReentrant returns (uint256 processed) {
        Session storage session = _requireSession(id);
        if (!session.cancelled) revert SessionNotCancelled();
        if (maxCount == 0 || maxCount > 100) revert InvalidLimit();
        return _processRefunds(id, session, maxCount);
    }

    /// @notice Attempt full-balance refunds for a bounded number of historical holders.
    /// @dev Callers must hold the reentrancy guard and ensure the session is cancelled.
    ///      Advance the cursor before calling canonical USDC; false or reverted transfers
    ///      leave tickets and escrow liabilities intact for pull refunds. Successful transfers
    ///      precede burns, which require no receiver callback and also permit soulbound tickets.
    ///      Total outstanding tickets are bounded by sold (at most 100000), so the uint32
    ///      conversion and refunded counter remain bounded by sold. Free tickets are burned
    ///      without calling USDC. Newly recorded holders may be processed by later batches;
    ///      previously examined holders receiving more tickets must use pull refunds.
    /// @param id Cancelled session ID whose participant list is processed.
    /// @param session Storage reference to the cancelled session.
    /// @param maxCount Maximum number of participant entries to examine.
    /// @return processed Number of participant entries examined, not successful refunds.
    function _processRefunds(uint256 id, Session storage session, uint256 maxCount)
        internal returns (uint256 processed)
    {
        address[] storage holders = participants[id];
        uint256 cursor = refundCursor[id];
        while (cursor < holders.length && processed < maxCount) {
            address holder = holders[cursor];
            ++cursor;
            ++processed;
            refundCursor[id] = cursor;

            uint256 bal = balanceOf(holder, id);
            if (bal == 0) continue;
            uint256 amount = bal * uint256(session.price);
            if (session.price != 0) {
                try usdc.transfer(holder, amount) returns (bool ok) {
                    if (!ok) continue;
                } catch {
                    continue;
                }
            }

            _burn(holder, id, bal);
            session.refunded += uint32(bal);
            refundedAmount[id][holder] += amount;
            emit TicketRefunded(id, holder, amount);
        }
    }

    /// @notice Buy one ticket using an ERC-20 allowance; a buyer may purchase only once.
    /// @dev A received transfer does not consume a buyer's purchase eligibility.
    function buyTicket(uint256 id) external nonReentrant {
        Session storage session = _requireSession(id);
        if (session.cancelled) revert SessionCancelled();
        if (block.timestamp >= session.startTime) revert SessionAlreadyStarted();
        if (session.sold >= session.supply) revert SoldOut();
        if (purchased[id][msg.sender]) revert AlreadyPurchased();
        if (msg.sender == session.expert) revert ExpertCannotPurchase();

        uint256 price = session.price;
        purchased[id][msg.sender] = true;
        ++session.sold;
        // Effects precede both the ERC-20 call and the ERC-1155 receiver callback.
        if (price != 0) {
            uint256 previousBalance = usdc.balanceOf(address(this));
            usdc.safeTransferFrom(msg.sender, address(this), price);
            uint256 currentBalance = usdc.balanceOf(address(this));
            if (currentBalance < previousBalance || currentBalance - previousBalance != price) {
                revert UnexpectedUSDCAmount();
            }
        }
        emit TicketPurchased(id, msg.sender, price);
        _mint(msg.sender, id, 1, "");
    }

    /// @notice Burn one held ticket of a cancelled session and refund its full price.
    /// @dev Refund rights follow current ownership, including transferred tickets.
    function refund(uint256 id) external nonReentrant {
        Session storage session = _requireSession(id);
        if (!session.cancelled) revert SessionNotCancelled();
        if (balanceOf(msg.sender, id) == 0) revert NoTicket();
        uint256 price = session.price;
        ++session.refunded;
        _burn(msg.sender, id, 1);
        refundedAmount[id][msg.sender] += price;
        emit TicketRefunded(id, msg.sender, price);
        if (price != 0) usdc.safeTransfer(msg.sender, price);
    }

    /// @notice Release session proceeds to its expert only after the session ends.
    /// @dev Fees remain as an accrued pull-payment liability, never pushed to a treasury.
    function withdrawProceeds(uint256 id) external nonReentrant {
        Session storage session = _requireSession(id);
        _requireExpert(session);
        if (session.cancelled) revert SessionCancelled();
        if (session.paidOut) revert SessionAlreadyPaidOut();
        _requireEnded(session);
        uint256 gross = uint256(session.price) * session.sold;
        uint256 fee = gross * session.feeBps / 10000;
        uint256 net = gross - fee;
        session.paidOut = true;
        accruedFees += fee;
        emit ProceedsWithdrawn(id, session.expert, net, fee);
        if (net != 0) usdc.safeTransfer(session.expert, net);
    }

    /// @notice Withdraw only accrued platform fees, never ticket escrow.
    function withdrawFees(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        uint256 amount = accruedFees;
        accruedFees = 0;
        emit FeesWithdrawn(to, amount);
        if (amount != 0) usdc.safeTransfer(to, amount);
    }

    /// @notice Change the platform fee for future sessions only.
    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        uint16 previous = feeBps;
        feeBps = newFeeBps;
        emit FeeBpsUpdated(previous, newFeeBps);
    }

    /// @notice Mint soulbound attendance certificates to up to 100 current holders.
    /// @dev Nonholders and existing certificate holders are silently skipped. A valid
    ///      recipient contract must accept ERC-1155 tokens, or the transaction reverts.
    function mintCertificates(uint256 id, address[] calldata recipients) external nonReentrant {
        Session storage session = _requireSession(id);
        _requireExpert(session);
        if (session.cancelled) revert SessionCancelled();
        _requireEnded(session);
        if (recipients.length > 100) revert TooManyRecipients();
        uint256 certId = certificateId(id);
        for (uint256 i; i < recipients.length; ++i) {
            address recipient = recipients[i];
            if (balanceOf(recipient, id) == 0 || balanceOf(recipient, certId) != 0) continue;
            emit CertificateMinted(id, recipient);
            _mint(recipient, certId, 1, "");
        }
    }

    /// @notice Convert a ticket session ID into its certificate ID without storage reads.
    /// @dev Validates the namespace, not session existence.
    function certificateId(uint256 sessionId) public pure returns (uint256) {
        if (sessionId == 0 || sessionId >= CERT_OFFSET) revert InvalidSessionId();
        return CERT_OFFSET + sessionId;
    }

    /// @notice Offchain apps may use this view for ticket-holder soft-gate display decisions.
    /// @dev Does not make event links private or restrict getEventLink; expert display is app policy.
    function hasAccess(uint256 id, address user) external view returns (bool) {
        Session storage session = _sessions[id];
        return session.expert != address(0) && !session.cancelled && balanceOf(user, id) > 0;
    }

    /// @notice Return the PUBLIC event link of an existing session, without access checks.
    /// @dev WARNING: Event links are PUBLIC CHAIN DATA readable by anyone, including
    ///      nonholders, via this getter, storage and transaction calldata. eth_call callers
    ///      can spoof msg.sender; a getter gate would not provide confidentiality.
    ///      App-only display to ticket holders and the expert is merely a soft gate.
    ///      Links remain readable after cancellation or session end.
    function getEventLink(uint256 id) external view returns (string memory) {
        _requireSession(id);
        return _eventLinks[id];
    }

    /// @notice Return the public cover URL of an existing session; empty means no cover.
    function getCoverUrl(uint256 id) external view returns (string memory) {
        _requireSession(id);
        return _coverUrls[id];
    }

    /// @notice Return an ascending page of public cover URLs, including cancelled sessions.
    /// @dev Mirrors getSessions: fromId is inclusive; zero means 1. Limit is capped at 200.
    ///      Index i corresponds to session fromId + i after normalizing zero to 1.
    function getCoverUrls(uint256 fromId, uint256 limit) external view returns (string[] memory result) {
        if (fromId == 0) fromId = 1;
        if (fromId > sessionCount) return new string[](0);
        uint256 length = sessionCount - fromId + 1;
        if (limit > PAGE_LIMIT) limit = PAGE_LIMIT;
        if (length > limit) length = limit;
        result = new string[](length);
        for (uint256 i; i < length; ++i) result[i] = _coverUrls[fromId + i];
    }

    /// @notice Return all stored fields of an existing session.
    function getSession(uint256 id) external view returns (Session memory) {
        return _requireSession(id);
    }

    /// @notice Return an ascending page of sessions, including cancelled sessions.
    /// @dev fromId is inclusive; zero means 1. Limit is capped at 200.
    function getSessions(uint256 fromId, uint256 limit) external view returns (Session[] memory result) {
        if (fromId == 0) fromId = 1;
        if (fromId > sessionCount) return new Session[](0);
        uint256 length = sessionCount - fromId + 1;
        if (limit > PAGE_LIMIT) limit = PAGE_LIMIT;
        if (length > limit) length = limit;
        result = new Session[](length);
        for (uint256 i; i < length; ++i) result[i] = _sessions[fromId + i];
    }

    /// @notice Return an expert profile; unregistered addresses return default fields.
    function getExpert(address expert) external view returns (Expert memory) {
        return experts[expert];
    }

    /// @notice Number of distinct current or historical ticket holders.
    function participantCount(uint256 id) external view returns (uint256) {
        return participants[id].length;
    }

    /// @notice Return how many historical participants remain unexamined for automatic refunds.
    /// @dev Returns zero unless cancelled, including for nonexistent sessions. This is not a
    ///      count of unpaid holders: failed transfers and tickets received by already examined
    ///      participants require pull refunds even when this returns zero. New participants
    ///      recorded by transfers after cancellation increase the pending count.
    /// @param id Session ID to query.
    /// @return Number of participant entries beyond the cursor, clamped to zero.
    function refundsPending(uint256 id) external view returns (uint256) {
        if (!_sessions[id].cancelled) return 0;
        uint256 count = participants[id].length;
        uint256 cursor = refundCursor[id];
        return count - (cursor < count ? cursor : count);
    }

    /// @notice Return historical holders in first-receipt order; offset is zero-based.
    /// @dev Limit is capped at 200; zero-value transfers do not add nonholders.
    function getParticipants(uint256 id, uint256 offset, uint256 limit)
        external view returns (address[] memory result)
    {
        address[] storage holders = participants[id];
        if (offset >= holders.length) return new address[](0);
        uint256 length = holders.length - offset;
        if (limit > PAGE_LIMIT) limit = PAGE_LIMIT;
        if (length > limit) length = limit;
        result = new address[](length);
        for (uint256 i; i < length; ++i) result[i] = holders[offset + i];
    }

    /// @notice Onchain JSON metadata with a generic SVG, never an event link.
    /// @dev Metadata exists for either token type once its underlying session exists.
    function uri(uint256 id) public view override returns (string memory) {
        bool isCertificate = id >= CERT_OFFSET;
        uint256 sessionId = isCertificate ? id - CERT_OFFSET : id;
        Session storage session = _requireSession(sessionId);
        string memory tokenType = isCertificate ? "Attendance Certificate" : "Ticket";
        string memory json = string.concat(
            '{"name":"', Strings.escapeJSON(session.title), ' - ', tokenType,
            '","description":"ExpertPass session ticket or expert-issued attendance certificate.","image":"',
            _imageURI(), '","attributes":', _attributes(session, tokenType), '}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @inheritdoc ERC1155
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Restrict all non-mint/burn transfers, including batch entries; record
    ///      holders before the inherited acceptance callback can execute.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal override
    {
        if (ids.length != values.length) revert ERC1155InvalidArrayLength(ids.length, values.length);
        if (from != address(0) && to != address(0)) {
            for (uint256 i; i < ids.length; ++i) {
                if (ids[i] >= CERT_OFFSET || !_sessions[ids[i]].transferable) revert SoulboundToken();
            }
        }
        super._update(from, to, ids, values);
        if (to != address(0)) {
            for (uint256 i; i < ids.length; ++i) {
                uint256 id = ids[i];
                if (id < CERT_OFFSET && values[i] != 0 && !_participantSeen[id][to]) {
                    _participantSeen[id][to] = true;
                    participants[id].push(to);
                    emit ParticipantRecorded(id, to);
                }
            }
        }
    }

    function _requireSession(uint256 id) private view returns (Session storage session) {
        session = _sessions[id];
        if (session.expert == address(0)) revert SessionNotFound(id);
    }

    function _requireExpert(Session storage session) private view {
        if (msg.sender != session.expert) revert NotSessionExpert();
    }

    function _requireEnded(Session storage session) private view {
        if (block.timestamp < uint256(session.startTime) + session.duration) revert SessionNotEnded();
    }

    /// @dev Validate only byte length and a case-sensitive ASCII HTTP(S) prefix, not URL validity.
    function _validateEventLink(string memory eventLink) internal pure {
        bytes memory link = bytes(eventLink);
        if (link.length == 0 || link.length > 512) revert InvalidEventLink();
        bool isHttp = link.length >= 7 && bytes7(link) == bytes7("http://");
        bool isHttps = link.length >= 8 && bytes8(link) == bytes8("https://");
        if (!isHttp && !isHttps) revert InvalidEventLink();
    }

    /// @dev Allow no cover, otherwise validate byte length and a case-sensitive ASCII HTTPS prefix.
    function _validateCoverUrl(string memory coverUrl) internal pure {
        bytes memory link = bytes(coverUrl);
        if (link.length == 0) return;
        if (link.length > 512 || link.length < 8) revert InvalidCoverUrl();
        if (bytes8(link) != bytes8("https://")) revert InvalidCoverUrl();
    }

    function _validateSessionDetails(
        string memory title,
        string memory description,
        uint8 category,
        uint64 startTime,
        uint32 duration
    ) private view {
        if (bytes(title).length == 0 || bytes(title).length > 120) revert InvalidTitle();
        if (bytes(description).length > 4000) revert InvalidDescription();
        if (category > 7) revert InvalidCategory();
        if (startTime <= block.timestamp) revert InvalidStartTime();
        if (duration < 5 minutes || duration > 30 days) revert InvalidDuration();
    }

    function _attributes(Session storage session, string memory tokenType) private view returns (string memory) {
        return string.concat(
            '[{"trait_type":"Category","value":"', _categoryName(session.category),
            '"},{"trait_type":"Start time","display_type":"date","value":',
            uint256(session.startTime).toString(),
            '},{"trait_type":"Type","value":"', tokenType, '"}]'
        );
    }

    function _categoryName(uint8 category) private pure returns (string memory) {
        string[8] memory names = [
            "Technology & Engineering", "Medicine & Health", "Business & Finance", "Design & Creative",
            "Marketing & Growth", "Education & Skills", "Legal & Compliance", "Other"
        ];
        return names[category];
    }

    function _imageURI() private pure returns (string memory) {
        // Entirely static SVG: no user-controlled text or markup is interpolated.
        return string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(
                '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">'
                '<rect width="640" height="400" rx="24" fill="#111827"/>'
                '<circle cx="320" cy="140" r="52" fill="#2563eb"/>'
                '<path d="M295 140l18 18 34-36" fill="none" stroke="white" stroke-width="10"/>'
                '<text x="320" y="270" text-anchor="middle" font-family="sans-serif" font-size="42" fill="white">ExpertPass</text>'
                '<text x="320" y="315" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#93c5fd">Learn. Connect. Grow.</text>'
                '</svg>'
            ))
        );
    }
}
