pragma ton-solidity >= 0.39.0;
pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;


import '@broxus/contracts/contracts/access/InternalOwner.sol';
import '@broxus/contracts/contracts/utils/CheckPubKey.sol';
import '@broxus/contracts/contracts/utils/RandomNonce.sol';
import "@broxus/contracts/contracts/libraries/MsgFlag.sol";


import "ton-eth-bridge-token-contracts/contracts/interfaces/ITokenRoot.sol";
import 'ton-eth-bridge-token-contracts/contracts/interfaces/ITokenWallet.sol';


contract Airdrop is InternalOwner, RandomNonce, CheckPubKey {
    struct Receiver {
        uint32 last_claimed_period_id;
        uint128 reward_per_period;
    }

    struct Period {
        uint32 start;
        uint32 end;
        uint32 id;
    }

    mapping(address => Receiver) receivers;

    address token;
    address token_wallet;
    uint32 start_timestamp;
    uint32 claim_period_in_seconds;
    uint32 claim_periods_amount;

    uint128 transferred_count = 0;

    uint128 constant claim_required_value = 2 ton;
    uint128 constant settings_deploy_wallet_grams = 0.5 ton;
    uint128 constant settings_transfer_grams = 0.5 ton;

    Period[] periods;

    constructor(
        address _token,
        address _owner,
        uint32 _start_timestamp,
        uint32 _claim_period_in_seconds,
        uint32 _claim_periods_amount
    ) public checkPubKey {
        tvm.accept();

        token = _token;
        start_timestamp = _start_timestamp;
        claim_period_in_seconds = _claim_period_in_seconds;
        claim_periods_amount = _claim_periods_amount;

        for (uint32 i = 0; i < claim_periods_amount; i++) {
            periods.push(Period({
                start: start_timestamp + 1 + i * claim_period_in_seconds,
                end: start_timestamp + (i + 1) * claim_period_in_seconds,
                id: i + 1
            }));
        }

        setOwnership(_owner);
        setUpTokenWallet();
    }

    function getDetails() external view returns(
        address _token,
        address _token_wallet,
        uint128 _claim_required_value,
        uint128 _transferred_count,
        uint32 _start_timestamp,
        uint32 _claim_period_in_seconds,
        uint32 _claim_periods_amount,
        Period[] _periods
    ) {
        return (
            token,
            token_wallet,
            claim_required_value,
            transferred_count,
            start_timestamp,
            claim_period_in_seconds,
            claim_periods_amount,
            periods
        );
    }

    function setUpTokenWallet() internal view {
        // Deploy token wallet
        ITokenRoot(token).deployWallet{
            value: 1 ton,
            callback: Airdrop.receiveTokenWalletAddress
        }(
            address(this),
            settings_deploy_wallet_grams
        );
    }

    function receiveTokenWalletAddress(
        address wallet
    ) external {
        require(msg.sender == token, 30004);

        token_wallet = wallet;
    }

    function getReceiverDetails(
        address user
    ) external view returns(Receiver receiver) {
        return receivers[user];
    }

    function getCurrentClaimable(
        address user
    ) public view returns(uint128 _amount, uint32 _last_claimed_period_id) {
        // airdrop hasn't started yet
        if (now < start_timestamp) return (0, 0);

        Receiver receiver = receivers[user];

        // User is not in the receivers list
        if (receiver.reward_per_period == 0) return (0, 0);

        uint128 amount = 0;
        uint32 last_claimed_period_id = 0;

        // Iterate over a periods, [(0,10),(10,20),(20,30)]
        for (uint32 i =0; i < claim_periods_amount; i++) {
            Period period = periods[i];

            // Period is not started yet
            if (period.start > now) break;

            if (receiver.last_claimed_period_id < period.id) {
                amount += receiver.reward_per_period;
                last_claimed_period_id = period.id;
            }
        }

        return (amount, last_claimed_period_id);
    }

    function claim() external {
        tvm.rawReserve(address(this).balance - msg.value, 2);

        require(msg.value >= claim_required_value, 30001);

        (uint128 amount, uint32 last_claimed_period_id) = getCurrentClaimable(msg.sender);

        require(amount > 0, 30002);

        receivers[msg.sender].last_claimed_period_id = last_claimed_period_id;
        transferred_count += amount;

        TvmCell empty;

        // Transfer tokens
        ITokenWallet(token_wallet).transfer{
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(
            amount,
            msg.sender,
            settings_deploy_wallet_grams,
            msg.sender,
            false,
            empty
        );
    }

    function setChunk(
        address[] _users,
        uint128[] _rewards_per_period
    ) external onlyOwner {
        require(_users.length == _rewards_per_period.length && _users.length > 0 && _users.length <= 50, 30003);

        for (uint128 i = 0; i < _users.length; i++) {
            receivers[_users[i]] = Receiver({
                reward_per_period: _rewards_per_period[i],
                last_claimed_period_id: 0
            });
        }
    }
}