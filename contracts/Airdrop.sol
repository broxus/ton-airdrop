pragma ton-solidity >= 0.39.0;
pragma AbiHeader time;
pragma AbiHeader expire;
pragma AbiHeader pubkey;


import './../node_modules/@broxus/contracts/contracts/access/InternalOwner.sol';
import './../node_modules/@broxus/contracts/contracts/utils/CheckPubKey.sol';
import './../node_modules/@broxus/contracts/contracts/utils/RandomNonce.sol';
import "./../node_modules/@broxus/contracts/contracts/libraries/MsgFlag.sol";


import "./../node_modules/broxus-ton-tokens-contracts/free-ton/contracts/interfaces/IRootTokenContract.sol";
import "./../node_modules/broxus-ton-tokens-contracts/free-ton/contracts/interfaces/ITONTokenWallet.sol";


contract Airdrop is InternalOwner, RandomNonce, CheckPubKey {
    mapping(address => uint128) receivers;

    address token;
    address token_wallet;

    uint128 transferred_count = 0;

    uint128 constant claim_required_value = 2 ton;
    uint128 constant settings_deploy_wallet_grams = 0.2 ton;
    uint128 constant settings_transfer_grams = 0.5 ton;

    constructor(
        address _token,
        address _owner
    ) public checkPubKey {
        tvm.accept();

        token = _token;

        setOwnership(_owner);
        setUpTokenWallet();
    }

    function getDetails() external view returns(
        address _token,
        address _token_wallet,
        uint128 _claim_required_value,
        uint128 _transferred_count
    ) {
        return (token, token_wallet, claim_required_value, transferred_count);
    }

    function setUpTokenWallet() internal view {
        // Deploy token wallet
        IRootTokenContract(token).deployEmptyWallet{value: 1 ton}(
            settings_deploy_wallet_grams,
            0,
            address(this),
            address(this)
        );

        // Request for token wallet address
        IRootTokenContract(token).getWalletAddress{
            value: 1 ton,
            callback: Airdrop.receiveTokenWalletAddress
        }(
            0,
            address(this)
        );
    }

    function receiveTokenWalletAddress(
        address wallet
    ) external {
        require(msg.sender == token, 30004);

        token_wallet = wallet;
    }

    function getClaimable(
        address user
    ) external view returns(uint128) {
        return receivers[user];
    }

    function claim() external {
        require(msg.value >= claim_required_value, 30001);
        require(receivers[msg.sender] > 0, 30002);

        uint128 amount = receivers[msg.sender];
        transferred_count += amount;

        TvmCell empty;

        delete receivers[msg.sender];

        // Transfer tokens
        ITONTokenWallet(token_wallet).transferToRecipient{
            value: 0,
            flag: MsgFlag.ALL_NOT_RESERVED
        }(
            0,
            msg.sender,
            amount,
            settings_deploy_wallet_grams,
            settings_transfer_grams,
            msg.sender,
            false,
            empty
        );
    }

    function setChunk(
        address[] _users,
        uint128[] _amounts
    ) external onlyOwner {
        require(_users.length == _amounts.length && _users.length > 0 && _users.length <= 50, 30003);

        for (uint128 i = 0; i < _users.length; i++) {
            receivers[_users[i]] = _amounts[i];
        }
    }
}