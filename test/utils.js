const logger = require('mocha-logger');
const chai = require('chai');
chai.use(require('chai-bignumber')());

const { expect } = chai;


const TOKEN_PATH = 'node_modules/ton-eth-bridge-token-contracts/build';


async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Due to the network lag, graphql may not catch wallets updates instantly
const afterRun = async (tx) => {
    if (locklift.network === 'dev' || locklift.network === 'prod') {
        await sleep(100000);
    }
};


const stringToBytesArray = (dataString) => {
    return Buffer.from(dataString).toString('hex')
};


const setupAirdrop = async (_start_timestamp, _claim_period_in_seconds, _claim_periods_amount) => {
    const [keyPair] = await locklift.keys.getKeyPairs();
    const _randomNonce = locklift.utils.getRandomNonce();

    const Account = await locklift.factory.getAccount('Wallet');
    const owner = await locklift.giver.deployContract({
        contract: Account,
        constructorParams: {},
        initParams: {
            _randomNonce,
        },
        keyPair,
    }, locklift.utils.convertCrystal(10, 'nano'));

    owner.setKeyPair(keyPair);
    owner.afterRun = afterRun;
    owner.name = 'Airdrop owner';

    logger.log(`Owner: ${owner.address}`);

    // Token
    const RootToken = await locklift.factory.getContract('TokenRoot', TOKEN_PATH);
    const TokenWallet = await locklift.factory.getContract('TokenWallet', TOKEN_PATH);

    const root = await locklift.giver.deployContract({
        contract: RootToken,
        constructorParams: {
            initialSupplyTo: owner.address,
            initialSupply: 0,
            deployWalletValue: locklift.utils.convertCrystal('0.1', 'nano'),
            mintDisabled: false,
            burnByRootDisabled: true,
            burnPaused: false,
            remainingGasTo: locklift.utils.zeroAddress
        },
        initParams: {
            deployer_: locklift.utils.zeroAddress,
            randomNonce_: locklift.utils.getRandomNonce(),
            rootOwner_: owner.address,
            name_: 'Airdrop token',
            symbol_: 'AIRDROP',
            decimals_: 9,
            walletCode_: TokenWallet.code,
        },
        keyPair,
    });

    logger.log(`Token root: ${root.address}`);


    // Airdrop
    const Airdrop = await locklift.factory.getContract('Airdrop');
    const airdrop = await locklift.giver.deployContract({
        contract: Airdrop,
        constructorParams: {
            _token: root.address,
            _owner: owner.address,
            _start_timestamp,
            _claim_period_in_seconds,
            _claim_periods_amount
        },
        initParams: {
            _randomNonce,
        },
        keyPair,
    }, locklift.utils.convertCrystal(10, 'nano'));

    logger.log(`Airdrop: ${airdrop.address}`);

    return [owner, root, airdrop];
};


module.exports = {
    setupAirdrop,
    expect,
    afterRun,
    sleep,
};
