const {
    afterRun,
} = require('./../test/utils');

// const { parse } = require('csv-parse/sync');
const {load} = require('csv-load-sync');

const _ = require('underscore');
const prompts = require('prompts');
const ora = require('ora');
const fs = require('fs');
const BigNumber = require('bignumber.js');
const logger = require("mocha-logger");
const {use} = require("chai");

const isValidTonAddress = (address) => /^(?:-1|0):[0-9a-fA-F]{64}$/.test(address);


const main = async () => {
    const response = await prompts([
        {
            type: 'text',
            name: 'data',
            message: 'Name of the csv file with airdrop addresses and amount, should be placed in the repo root',
            initial: 'data.csv',
        },
        {
            type: 'text',
            name: 'owner',
            message: 'Airdrop owner',
            validate: value => isValidTonAddress(value) ? true : 'Invalid address'
        },
        {
            type: 'text',
            name: 'token',
            message: 'Token root',
            validate: value => isValidTonAddress(value) ? true : 'Invalid address'
        },
        {
            type: 'number',
            name: 'start_timestamp',
            initial: Math.floor(Date.now() / 1000),
            message: 'Airdrop start timestamp',
        },
        {
            type: 'number',
            name: 'claim_period_in_seconds',
            initial: 60 * 60 * 24 * 30,
            message: 'Claim period duration in seconds (default = 1 month)'
        },
        {
            type: 'number',
            name: 'claim_periods_amount',
            initial: 12,
            message: 'Claim periods amount'
        }
    ]);

    // Read csv
    const data = load(response.data);
    const chunks = _.chunk(data, 50);

    // console.log(data[data.length - 1]);
    //
    // process.exit(0);

    // Setup tmp owner
    const [keyPair] = await locklift.keys.getKeyPairs();
    const _randomNonce = locklift.utils.getRandomNonce();

    const Account = await locklift.factory.getAccount('Wallet');

    const spinner = ora('Deploying initial owner').start();

    const owner = await locklift.giver.deployContract({
        contract: Account,
        constructorParams: {},
        initParams: {
            _randomNonce,
        },
        keyPair,
    }, locklift.utils.convertCrystal(100, 'nano'));

    owner.setKeyPair(keyPair);
    owner.afterRun = afterRun;
    owner.name = 'Airdrop owner';

    spinner.stop();
    logger.log(`Initial owner: ${owner.address}`);

    // Deploy Airdrop
    spinner.start('Deploying airdrop');

    const Airdrop = await locklift.factory.getContract('Airdrop');
    const airdrop = await locklift.giver.deployContract({
        contract: Airdrop,
        constructorParams: {
            _token: response.token,
            _owner: owner.address,
            _start_timestamp: response.start_timestamp,
            _claim_period_in_seconds: response.claim_period_in_seconds,
            _claim_periods_amount: response.claim_periods_amount
        },
        initParams: {
            _randomNonce,
        },
        keyPair,
    }, locklift.utils.convertCrystal(10, 'nano'));

    spinner.stop();
    logger.log(`Airdrop: ${airdrop.address}`);

    // Setup addresses by chunks
    logger.log(`Found ${data.length} users`);

    for (const [i, chunk] of chunks.entries()) {
        // logger.log();
        spinner.start(`Uploading chunk ${i + 1} / ${chunks.length}`);

        // console.log(chunk);
        const _users = chunk.map((i) => i.user);
        const _rewards_per_period = chunk.map((i) => i.reward);

        await owner.runTarget({
            contract: airdrop,
            method: 'setChunk',
            params: {
                _users,
                _rewards_per_period,
            },
            value: locklift.utils.convertCrystal(2, 'nano')
        });

        spinner.stop();
    }

    logger.success(`Chunks uploaded`);

    spinner.start(`Transferring ownership`);

    // Transfer ownership
    await owner.runTarget({
        contract: airdrop,
        method: 'transferOwnership',
        params: {
            newOwner: response.owner,
        }
    });

    spinner.stop();

    logger.success('Ownership transferred');
};


main()
    .then(() => process.exit(0))
    .catch(e => {
        console.log(e);
        process.exit(1);
    });
