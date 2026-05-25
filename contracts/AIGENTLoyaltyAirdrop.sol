// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title AIGENT 五层忠诚空投
/// @notice L1基础→L2锁仓→L3内容→L4邀请→L5大使，逐级升级
contract AIGENTLoyaltyAirdrop is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    IERC20 public immutable aigent;

    // ── 层级定义 ──
    enum Tier { None, L1_Basic, L2_Staker, L3_Creator, L4_Referrer, L5_Ambassador }

    struct TierInfo {
        uint256 reward;
        string name;
    }
    mapping(Tier => TierInfo) public tiers;

    // ── 任务类型 ──
    enum Task { XFollow, XRepost, XOriginalPost, Invite, CreateContent }
    mapping(Task => uint256) public taskPoints; // 每个任务给多少积分

    // ── 锁仓 ──
    struct Stake {
        uint256 amount;
        uint256 startTime;
        uint256 duration; // 30/90/180 天
        bool active;
    }
    mapping(address => Stake) public stakes;

    // ── 玩家数据 ──
    struct Player {
        Tier tier;
        uint256 totalClaimed;
        uint256 points;
        uint256 lastClaimTime;
        address referrer;
        uint256 referralCount;
        mapping(Task => bool) completedTasks; // 每个任务只能做一次
    }
    mapping(address => Player) private players;

    // ── 全局限制 ──
    uint256 public dailyCap = 1000000 * 1e18;  // 每天最多发 100 万枚
    uint256 public todayClaimed;
    uint256 public lastDay;
    uint256 public totalAllocated;              // 总共已分配
    uint256 public constant MAX_ALLOCATION = 400000000 * 1e18; // 最多发 4 亿

    // ── 升级分数线 ──
    uint256 public constant L2_POINTS_REQUIRED = 10;
    uint256 public constant L3_POINTS_REQUIRED = 50;
    uint256 public constant L4_POINTS_REQUIRED = 200;
    uint256 public constant L5_POINTS_REQUIRED = 1000;

    // ── 签名验证 ──
    address public verifier; // 运营私钥地址，用于签名任务证明

    // ── 黑名单 ──
    mapping(address => bool) public blacklisted;

    // ── 事件 ──
    event Claimed(address indexed player, Tier tier, uint256 amount);
    event TierUpgraded(address indexed player, Tier newTier);
    event TaskCompleted(address indexed player, Task task, uint256 points);
    event Staked(address indexed player, uint256 amount, uint256 duration);
    event Unstaked(address indexed player, uint256 amount, uint256 bonus);
    event ReferralReward(address indexed referrer, address indexed referee, uint256 amount);

    constructor(address _aigent, address _verifier) Ownable(msg.sender) {
        aigent = IERC20(_aigent);
        verifier = _verifier;

        tiers[Tier.L1_Basic]     = TierInfo(1000 * 1e18,    unicode"基础用户");
        tiers[Tier.L2_Staker]    = TierInfo(5000 * 1e18,    unicode"锁仓用户");
        tiers[Tier.L3_Creator]   = TierInfo(10000 * 1e18,   unicode"内容创作者");
        tiers[Tier.L4_Referrer]  = TierInfo(20000 * 1e18,   unicode"邀请达人");
        tiers[Tier.L5_Ambassador] = TierInfo(50000 * 1e18,  unicode"社区大使");

        taskPoints[Task.XFollow]        = 1;
        taskPoints[Task.XRepost]        = 2;
        taskPoints[Task.XOriginalPost]  = 10;
        taskPoints[Task.Invite]         = 5;
        taskPoints[Task.CreateContent]  = 20;
    }

    // ── 重置每日限额 ──
    function _resetDailyIfNeeded() private {
        uint256 today = block.timestamp / 1 days;
        if (today > lastDay) {
            todayClaimed = 0;
            lastDay = today;
        }
    }

    // ── 查看器 ──
    function getPlayer(address p) external view returns (
        Tier tier, uint256 totalClaimed, uint256 points,
        uint256 lastClaimTime, address referrer, uint256 referralCount
    ) {
        Player storage pl = players[p];
        return (pl.tier, pl.totalClaimed, pl.points, pl.lastClaimTime, pl.referrer, pl.referralCount);
    }

    function hasCompletedTask(address p, Task task) external view returns (bool) {
        return players[p].completedTasks[task];
    }

    function getStake(address p) external view returns (Stake memory) {
        return stakes[p];
    }

    function remainingToday() external view returns (uint256) {
        _resetDailyIfNeeded_temp();
        uint256 claimed = todayClaimed;
        return claimed >= dailyCap ? 0 : dailyCap - claimed;
    }

    function _resetDailyIfNeeded_temp() private view returns (uint256) {
        uint256 today = block.timestamp / 1 days;
        return today > lastDay ? dailyCap : (todayClaimed >= dailyCap ? 0 : dailyCap - todayClaimed);
    }

    // ═══════════════════════════════════════════════
    //  L1: 基础空投 — 连钱包即可领
    // ═══════════════════════════════════════════════

    function claimL1(address _referrer) external nonReentrant {
        require(!blacklisted[msg.sender], "Blacklisted");
        Player storage p = players[msg.sender];
        require(p.tier == Tier.None, "Already claimed L1");
        _resetDailyIfNeeded();
        require(todayClaimed + tiers[Tier.L1_Basic].reward <= dailyCap, "Daily cap");
        require(totalAllocated + tiers[Tier.L1_Basic].reward <= MAX_ALLOCATION, "Allocation exhausted");

        // 处理推荐
        if (_referrer != address(0) && _referrer != msg.sender) {
            p.referrer = _referrer;
            Player storage ref = players[_referrer];
            ref.referralCount++;
            ref.points += taskPoints[Task.Invite];
            if (ref.referralCount >= 5 && ref.tier < Tier.L4_Referrer) {
                _upgradeTier(_referrer, Tier.L4_Referrer);
            }
            // 推荐奖励
            uint256 refReward = 200 * 1e18;
            if (totalAllocated + refReward <= MAX_ALLOCATION) {
                ref.totalClaimed += refReward;
                totalAllocated += refReward;
                aigent.transfer(_referrer, refReward);
                emit ReferralReward(_referrer, msg.sender, refReward);
            }
        }

        p.tier = Tier.L1_Basic;
        p.lastClaimTime = block.timestamp;
        p.totalClaimed += tiers[Tier.L1_Basic].reward;
        p.points += 1;
        totalAllocated += tiers[Tier.L1_Basic].reward;
        todayClaimed += tiers[Tier.L1_Basic].reward;

        aigent.transfer(msg.sender, tiers[Tier.L1_Basic].reward);
        emit Claimed(msg.sender, Tier.L1_Basic, tiers[Tier.L1_Basic].reward);
    }

    // ═══════════════════════════════════════════════
    //  L2-L5: 完成任务拿积分，积分够自动升级
    // ═══════════════════════════════════════════════

    /// @notice 提交任务证明。verifier 对 (user, task) 签名后，用户来链上提交
    function submitTask(Task task, bytes calldata signature) external nonReentrant {
        require(!blacklisted[msg.sender], "Blacklisted");
        Player storage p = players[msg.sender];
        require(!p.completedTasks[task], "Task already done");
        require(p.tier != Tier.None, "Claim L1 first");

        // 验证签名: verifier 签了 (user, task)
        bytes32 hash = keccak256(abi.encodePacked(msg.sender, task));
        bytes32 ethSignedHash = hash.toEthSignedMessageHash();
        require(ethSignedHash.recover(signature) == verifier, "Invalid signature");

        p.completedTasks[task] = true;
        p.points += taskPoints[task];

        emit TaskCompleted(msg.sender, task, taskPoints[task]);

        // 自动升级检查
        _checkTierUpgrade(msg.sender);
    }

    /// @notice 只有 verifier 可以直接给用户加积分 (无需签名, 批量操作)
    function grantPoints(address user, uint256 amount) external {
        require(msg.sender == verifier || msg.sender == owner(), "Only verifier");
        Player storage p = players[user];
        require(p.tier != Tier.None, "Not a player");
        p.points += amount;
        _checkTierUpgrade(user);
    }

    // ═══════════════════════════════════════════════
    //  锁仓: 质押领取的币，锁定期间可获额外奖励
    // ═══════════════════════════════════════════════

    function stake(uint256 amount, uint256 durationDays) external nonReentrant {
        require(!blacklisted[msg.sender], "Blacklisted");
        require(!stakes[msg.sender].active, "Already staking");
        require(durationDays == 30 || durationDays == 90 || durationDays == 180, "Invalid duration");
        require(aigent.balanceOf(msg.sender) >= amount, "Insufficient balance");
        require(amount >= 1000 * 1e18, "Min 1000 AIGENT");

        aigent.transferFrom(msg.sender, address(this), amount);
        stakes[msg.sender] = Stake(amount, block.timestamp, durationDays * 1 days, true);

        // 锁仓加分
        uint256 pointsGain = durationDays == 30 ? 5 : (durationDays == 90 ? 20 : 50);
        players[msg.sender].points += pointsGain;
        _checkTierUpgrade(msg.sender);

        emit Staked(msg.sender, amount, durationDays);
    }

    function unstake() external nonReentrant {
        Stake storage s = stakes[msg.sender];
        require(s.active, "No active stake");
        require(block.timestamp >= s.startTime + s.duration, "Still locked");

        s.active = false;

        // 锁仓奖励: 30天+10%, 90天+30%, 180天+80%
        uint256 bonus;
        if (s.duration == 30 days) bonus = s.amount * 10 / 100;
        else if (s.duration == 90 days) bonus = s.amount * 30 / 100;
        else bonus = s.amount * 80 / 100;

        uint256 total = s.amount + bonus;
        aigent.transfer(msg.sender, total);

        emit Unstaked(msg.sender, s.amount, bonus);
    }

    /// @notice 提前解锁 — 罚没 50% 销毁
    function emergencyUnstake() external nonReentrant {
        Stake storage s = stakes[msg.sender];
        require(s.active, "No active stake");

        s.active = false;
        uint256 penalty = s.amount / 2;
        uint256 refund = s.amount - penalty;
        aigent.transfer(msg.sender, refund);
        emit Unstaked(msg.sender, s.amount, 0);
    }

    // ═══════════════════════════════════════════════
    //  积分升级
    // ═══════════════════════════════════════════════

    function _checkTierUpgrade(address user) private {
        Player storage p = players[user];
        uint256 pts = p.points;

        if (pts >= L5_POINTS_REQUIRED && p.tier < Tier.L5_Ambassador) {
            _upgradeTier(user, Tier.L5_Ambassador);
        } else if (pts >= L4_POINTS_REQUIRED && p.tier < Tier.L4_Referrer) {
            _upgradeTier(user, Tier.L4_Referrer);
        } else if (pts >= L3_POINTS_REQUIRED && p.tier < Tier.L3_Creator) {
            _upgradeTier(user, Tier.L3_Creator);
        } else if (pts >= L2_POINTS_REQUIRED && p.tier < Tier.L2_Staker) {
            _upgradeTier(user, Tier.L2_Staker);
        }
    }

    function _upgradeTier(address user, Tier newTier) private {
        Player storage p = players[user];
        Tier oldTier = p.tier;
        p.tier = newTier;

        // 发升级奖励 (差值)
        uint256 reward = tiers[newTier].reward;
        uint256 oldReward = tiers[oldTier].reward;
        if (reward > oldReward) {
            uint256 diff = reward - oldReward;
            if (totalAllocated + diff <= MAX_ALLOCATION) {
                p.totalClaimed += diff;
                totalAllocated += diff;
                aigent.transfer(user, diff);
                emit Claimed(user, newTier, diff);
            }
        }
        emit TierUpgraded(user, newTier);
    }

    // ═══════════════════════════════════════════════
    //  批量操作 (verifier / AI Agent 专用)
    // ═══════════════════════════════════════════════

    function batchReward(address[] calldata users, uint256[] calldata amounts) external {
        require(msg.sender == verifier || msg.sender == owner(), "Only verifier");
        require(users.length == amounts.length, "Mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            if (blacklisted[users[i]]) continue;
            Player storage p = players[users[i]];
            uint256 amt = amounts[i];
            if (totalAllocated + amt > MAX_ALLOCATION) break;
            p.totalClaimed += amt;
            totalAllocated += amt;
            p.points += amt / (1e18) / 1000; // 每 1000 币 = 1 积分
            aigent.transfer(users[i], amt);
            _checkTierUpgrade(users[i]);
            emit Claimed(users[i], p.tier, amt);
        }
    }

    // ═══════════════════════════════════════════════
    //  Admin
    // ═══════════════════════════════════════════════

    function setVerifier(address v) external onlyOwner { verifier = v; }
    function setDailyCap(uint256 cap) external onlyOwner { dailyCap = cap; }

    function blacklist(address user, bool blocked) external onlyOwner {
        blacklisted[user] = blocked;
    }

    function setTaskPoints(Task task, uint256 pts) external onlyOwner {
        taskPoints[task] = pts;
    }

    function setTierReward(Tier tier, uint256 reward) external onlyOwner {
        tiers[tier].reward = reward;
    }

    /// @notice Owner 可提取误转入的 ETH (合约不收 ETH)
    function withdrawETH() external onlyOwner {
        (bool ok, ) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "ETH transfer failed");
    }
}
