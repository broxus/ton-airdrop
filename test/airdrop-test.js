const {
  expect,
  setupAirdrop
} = require('./utils');


let owner, root, airdrop;

describe('Test Airdrop contract', async function() {
  this.timeout(20000000);

  it('Deploy airdrop', async () => {
    [owner, root, airdrop] = await setupAirdrop();
  });

  it('Check airdrop details', async () => {
    const details = await airdrop.call({ method: 'getDetails' });

    expect(root.address)
        .to.be.equal(details._token, 'Wrong token');
    expect(details._token_wallet)
        .to.not.be.equal(locklift.utils.zeroAddress, 'Wrong token wallet');
  });

  it('Setup single address chunk', async () => {
    await owner.runTarget({
      contract: airdrop,
      method: 'setChunk',
      params: {
        _users: [owner.address],
        _amounts: [locklift.utils.convertCrystal(10, 'nano')]
      }
    });

    expect(await airdrop.call({ method: 'getClaimable', params: { user: owner.address } }))
        .to.be.bignumber.equal(locklift.utils.convertCrystal(10, 'nano'), 'Wrong claimable amount');
  });

  it('Fill airdrop contract with tokens', async () => {
    const details = await airdrop.call({ method: 'getDetails' });
    const amount = locklift.utils.convertCrystal(11, 'nano');

    await owner.runTarget({
      contract: root,
      method: 'mint',
      params: {
        tokens: amount,
        to: details._token_wallet
      }
    });

    expect(await root.call({ method: 'getTotalSupply' }))
        .to.be.bignumber.equal(amount, 'Wrong total supply');
  });

  it('Claim tokens', async () => {
    await owner.runTarget({
      contract: airdrop,
      method: 'claim',
      params: {},
      value: locklift.utils.convertCrystal(2.1, 'nano')
    });

    expect(await airdrop.call({ method: 'getClaimable', params: { user: owner.address } }))
        .to.be.bignumber.equal(0, 'Wrong claimable amount');
  });

  it('Check tokens received', async () => {
    const ownerTokenWalletAddress = await root.call({
      method: 'getWalletAddress',
      params: {
        wallet_public_key_: 0,
        owner_address_: owner.address
      },
    });

    const ownerTokenWallet = await locklift.factory.getContract(
        'TONTokenWallet',
        './node_modules/broxus-ton-tokens-contracts/free-ton/build'
    );

    ownerTokenWallet.setAddress(ownerTokenWalletAddress);

    expect(await ownerTokenWallet.call({ method: 'balance' }))
        .to.be.bignumber.equal(locklift.utils.convertCrystal(10, 'nano'), 'Wrong balance');
  });

  it('Check transferred count', async () => {
    const details = await airdrop.call({ method: 'getDetails' });

    expect(details._transferred_count)
        .to.be.bignumber.equal(locklift.utils.convertCrystal(10, 'nano'), 'Wrong count');
  });
});
