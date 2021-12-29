const logger = require('mocha-logger');
const chai = require('chai');
chai.use(require('chai-bignumber')());

const { expect } = chai;


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


const setupAirdrop = async () => {
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
    const RootToken = await locklift.factory.getContract(
        'RootTokenContract',
        './node_modules/broxus-ton-tokens-contracts/free-ton/build'
    );

    const TokenWallet = await locklift.factory.getContract(
        'TONTokenWallet',
        './node_modules/broxus-ton-tokens-contracts/free-ton/build'
    );

    const root = await locklift.giver.deployContract({
        contract: RootToken,
        constructorParams: {
            root_public_key_: 0,
            root_owner_address_: owner.address
        },
        initParams: {
            name: stringToBytesArray('Dollar'),
            symbol: stringToBytesArray('USD'),
            decimals: 9,
            wallet_code: TokenWallet.code,
            _randomNonce,
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
            _owner: owner.address
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
};
