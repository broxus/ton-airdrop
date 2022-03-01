const {
  expect,
  sleep,
  setupAirdrop,
} = require('./utils');
const logger = require('mocha-logger');


let owner, root, airdrop;

const start_timestamp = Math.floor(Date.now() / 1000);
const claim_period_in_seconds = 60;
const claim_periods_amount = 3;


const TOKEN_PATH = 'node_modules/ton-eth-bridge-token-contracts/build';

// Airdrop balance in tokens
const amount = locklift.utils.convertCrystal(1000, 'nano');


describe(`Test Airdrop contract with ${claim_periods_amount} periods, each ${claim_period_in_seconds} seconds`, async function() {
  this.timeout(20000000);

  const reward_per_period = locklift.utils.convertCrystal(10, 'nano');

  it('Deploy airdrop', async () => {
    [owner, root, airdrop] = await setupAirdrop(
        start_timestamp,
        claim_period_in_seconds,
        claim_periods_amount
    );
  });

  it('Check airdrop details', async () => {
    const details = await airdrop.call({ method: 'getDetails' });

    expect(root.address)
        .to.be.equal(details._token, 'Wrong token');
    expect(details._token_wallet)
        .to.not.be.equal(locklift.utils.zeroAddress, 'Wrong token wallet');
    expect(details._periods)
        .to.have.lengthOf(claim_periods_amount, 'Wrong periods amount');
  });


  it('Fill airdrop with tokens', async () => {
    await owner.runTarget({
      contract: root,
      method: 'mint',
      params: {
        amount: amount,
        recipient: airdrop.address,
        deployWalletValue: locklift.utils.convertCrystal(1, 'nano'),
        remainingGasTo: owner.address,
        notify: false,
        payload: ''
      }
    });

    expect(await root.call({ method: 'totalSupply' }))
        .to.be.bignumber.equal(amount, 'Wrong total supply');
  });

  it('Check airdrop token wallet was deployed and received tokens', async () => {
    const airdropTokenWalletAddress = await root.call({
      method: 'walletOf',
      params: {
        walletOwner: airdrop.address
      },
    });

    logger.log(`Airdrop token wallet: ${airdropTokenWalletAddress}`);

    const airdropTokenWallet = await locklift.factory.getContract('TokenWallet', TOKEN_PATH);

    const details = await airdrop.call({ method: 'getDetails' });

    expect(details._token_wallet)
        .to.be.equal(airdropTokenWalletAddress, 'Wrong airdrop token wallet');

    airdropTokenWallet.setAddress(airdropTokenWalletAddress);

    expect(await airdropTokenWallet.call({ method: 'balance' }))
        .to.be.bignumber.equal(amount, 'Wrong balance');
  });

  it('Setup single address chunk', async () => {
    await owner.runTarget({
      contract: airdrop,
      method: 'setChunk',
      params: {
        _users: [owner.address],
        _rewards_per_period: [reward_per_period]
      }
    });

    const ownerClaimable = await airdrop.call({
      method: 'getCurrentClaimable',
      params: {
        user: owner.address
      }
    });

    expect(ownerClaimable._amount)
        .to.be.bignumber.equal(reward_per_period, 'Wrong owner claimable');
    expect(ownerClaimable._last_claimed_period_id)
        .to.be.bignumber.equal(1, 'Wrong owner last claimed period id');
  });

  describe('Claim tokens for first period', async () => {
    it('Claim tokens', async () => {
      await owner.runTarget({
        contract: airdrop,
        method: 'claim',
        params: {},
        value: locklift.utils.convertCrystal(2.1, 'nano')
      });
    });

    it('Check receiver last claimed period', async () => {
      const receiver = await airdrop.call({
        method: 'getReceiverDetails',
        params: {
          user: owner.address
        }
      });

      expect(receiver.last_claimed_period_id)
          .to.be.bignumber.equal(1, 'Wrong last claimed period id');
    });

    it('Check tokens received', async () => {
      const ownerTokenWalletAddress = await root.call({
        method: 'walletOf',
        params: {
          walletOwner: owner.address
        },
      });

      const ownerTokenWallet = await locklift.factory.getContract('TokenWallet', TOKEN_PATH);

      logger.log(`Owner token wallet: ${ownerTokenWalletAddress}`);

      ownerTokenWallet.setAddress(ownerTokenWalletAddress);

      expect(await ownerTokenWallet.call({ method: 'balance' }))
          .to.be.bignumber.equal(reward_per_period, 'Wrong balance');
    });

    it('Check transferred count', async () => {
      const details = await airdrop.call({ method: 'getDetails' });

      expect(details._transferred_count)
          .to.be.bignumber.equal(reward_per_period, 'Wrong count');
    });
  });

  describe('Claim again, too fast', async () => {
    it('Check there\'s no claimable tokens', async () => {
      const ownerClaimable = await airdrop.call({
        method: 'getCurrentClaimable',
        params: {
          user: owner.address
        }
      });

      expect(ownerClaimable._amount)
          .to.be.bignumber.equal(0, 'Wrong owner claimable');
    });

    it('Claim tokens', async () => {
      await owner.runTarget({
        contract: airdrop,
        method: 'claim',
        params: {},
        value: locklift.utils.convertCrystal(2.1, 'nano')
      });
    });

    it('Check tokens balance remains the same', async () => {
      const ownerTokenWalletAddress = await root.call({
        method: 'walletOf',
        params: {
          walletOwner: owner.address
        },
      });

      const ownerTokenWallet = await locklift.factory.getContract('TokenWallet', TOKEN_PATH);

      ownerTokenWallet.setAddress(ownerTokenWalletAddress);

      expect(await ownerTokenWallet.call({ method: 'balance' }))
          .to.be.bignumber.equal(reward_per_period, 'Wrong balance');
    });

    it('Check transferred count remains the same', async () => {
      const details = await airdrop.call({ method: 'getDetails' });

      expect(details._transferred_count)
          .to.be.bignumber.equal(reward_per_period, 'Wrong count');
    });
  });

  describe('Wait a little and claim second period', async () => {
    it('Wait until second period begins', async () => {
      const details = await airdrop.call({ method: 'getDetails' });

      const secondPeriodStart = details._periods[1].start;

      const secondsToSleep = secondPeriodStart - Math.floor(Date.now() / 1000);

      logger.log(`Sleep for ${secondsToSleep} seconds...`);

      await sleep(secondsToSleep * 1000);
    });

    it('Check second period can be claimed', async () => {
      const ownerClaimable = await airdrop.call({
        method: 'getCurrentClaimable',
        params: {
          user: owner.address
        }
      });

      expect(ownerClaimable._amount)
          .to.be.bignumber.equal(reward_per_period, 'Wrong owner claimable');
      expect(ownerClaimable._last_claimed_period_id)
          .to.be.bignumber.equal(2, 'Wrong owner last claimed period id');
    });

    it('Claim tokens', async () => {
      await owner.runTarget({
        contract: airdrop,
        method: 'claim',
        params: {},
        value: locklift.utils.convertCrystal(2.1, 'nano')
      });
    });

    it('Check receiver last claimed period', async () => {
      const receiver = await airdrop.call({
        method: 'getReceiverDetails',
        params: {
          user: owner.address
        }
      });

      expect(receiver.last_claimed_period_id)
          .to.be.bignumber.equal(2, 'Wrong last claimed period id');
    });

    it('Check tokens received', async () => {
      const ownerTokenWalletAddress = await root.call({
        method: 'walletOf',
        params: {
          walletOwner: owner.address
        },
      });

      const ownerTokenWallet = await locklift.factory.getContract('TokenWallet', TOKEN_PATH);

      ownerTokenWallet.setAddress(ownerTokenWalletAddress);

      expect(await ownerTokenWallet.call({ method: 'balance' }))
          .to.be.bignumber.equal(2 * reward_per_period, 'Wrong balance');
    });

    it('Check transferred count', async () => {
      const details = await airdrop.call({ method: 'getDetails' });

      expect(details._transferred_count)
          .to.be.bignumber.equal(2 * reward_per_period, 'Wrong count');
    });
  });
});
