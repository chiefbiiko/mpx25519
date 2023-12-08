const { expect } = require('chai')
const { ethers } = require('hardhat')
const {
  loadFixture
} = require('@nomicfoundation/hardhat-toolbox/network-helpers')
const { kdf, scalarMult } = require('../src')

async function deploy(contractName, ...args) {
  return ethers.getContractFactory(contractName).then(f => f.deploy(...args))
}

function hex(b) {
  return Buffer.from(b).toString('hex')
}

function buf (s) {
  return Buffer.from(s.replace("0x",""), "hex")
}

describe('MPX25519', function () {
  async function MPX25519Fixture() {
    const [alice, bob, charlie, dave, eve, ferdie] = await ethers.getSigners()
    const safeMock23 = await deploy('SafeMock23', [alice, bob, charlie])
    const safeMock35 = await deploy('SafeMock35', [
      alice,
      bob,
      charlie,
      dave,
      eve
    ])

    await safeMock23.connect(alice).deployMPX25519()
    await safeMock35.connect(alice).deployMPX25519()

    const MPX25519 = await ethers.getContractFactory('MPX25519')
    const camelot23 = MPX25519.attach(await safeMock23.camelot())
    const camelot35 = MPX25519.attach(await safeMock35.camelot())

    const G = new Uint8Array(32)
    G[0] = 9

    return {
      alice,
      bob,
      charlie,
      dave,
      eve,
      ferdie,
      safeMock23,
      safeMock35,
      camelot23,
      camelot35,
      G
    }
  }

  it('should have deployed MPX25519 through Safe', async function () {
    const { camelot23, camelot35 } = await loadFixture(MPX25519Fixture)

    const camelot23Code = await ethers.provider
      .getCode(await camelot23.getAddress())
      .then(c => c.replace('0x', ''))
    const camelot35Code = await ethers.provider
      .getCode(await camelot35.getAddress())
      .then(c => c.replace('0x', ''))

    expect(camelot23Code.length).to.be.greaterThan(0)
    expect(camelot35Code.length).to.be.greaterThan(0)

    const signers23 = await camelot23.getSigners()
    expect(signers23.length).to.equal(3)
  })

  it('pk inspection', async function () {
    const { alice, G } = await loadFixture(MPX25519Fixture)

    const a = await kdf(alice)
    const aG = scalarMult(a.secretKey, G)

    expect(aG).to.deep.equal(a.publicKey)
  })

  it('poc', async function () {
    const { alice, bob, charlie } = await loadFixture(MPX25519Fixture)

    const a = await kdf(alice)
    const b = await kdf(bob)
    const c = await kdf(charlie)

    const aG = a.publicKey
    console.log("aG", hex(aG))
    const bG = b.publicKey
    console.log("bG", hex(bG))
    const cG = c.publicKey
    console.log("cG", hex(cG))

    const aGb = scalarMult(b.secretKey, aG)
    console.log("aGb", hex(aGb))
    const bGc = scalarMult(c.secretKey, bG)
    console.log("bGc", hex(bGc))
    const cGa = scalarMult(a.secretKey, cG)
    console.log("cGa", hex(cGa))

    const aGbc = hex(scalarMult(c.secretKey, aGb))
    const bGca = hex(scalarMult(a.secretKey, bGc))
    const cGab = hex(scalarMult(b.secretKey, cGa))

    expect(aGbc).to.equal(bGca)
    expect(bGca).to.equal(cGab)
  })

  it('poc via contract', async function () {
    const { alice, bob, charlie, camelot23 } =
      await loadFixture(MPX25519Fixture)
      const signers = [alice, bob, charlie]
      async function _logQueues() {
        //DBG
        for (let i = 0; i < signers.length; i++) {
          console.log(
            'queue',
            i,
            'length',
            await camelot23.getQueue(i).then(q => q.length)
          )
        }
        console.log('==================')
      }

    const a = await kdf(alice)
    const b = await kdf(bob)
    const c = await kdf(charlie)

    // const aG = a.publicKey
    console.log("a.publicKey", hex(a.publicKey))
    await camelot23.connect(alice).step(a.publicKey)
    await camelot23.connect(alice).done()
    // const bG = b.publicKey
    console.log("b.publicKey", hex(b.publicKey))
    await camelot23.connect(bob).step(b.publicKey)
    await camelot23.connect(bob).done()
    // const cG = c.publicKey
    console.log("c.publicKey", hex(c.publicKey))
    await camelot23.connect(charlie).step(c.publicKey)
    await camelot23.connect(charlie).done()
    // await _logQueues() //DBG
    // const aGb = scalarMult(b.secretKey, aG)
    const aG = await camelot23.prep(bob.address).then(([_, k]) => buf(k))
    console.log("bob pulld aG", hex(aG))
    const aGb = scalarMult(b.secretKey, aG)
    console.log("bob comp aGb", hex(aGb))
    await camelot23.connect(bob).step(aGb)
    await camelot23.connect(bob).done()

    // const bGc = scalarMult(c.secretKey, bG)
    const bG = await camelot23.prep(charlie.address).then(([_, k]) => buf(k))
    console.log("charlie pulld bG", hex(bG))
    const bGc = scalarMult(c.secretKey, bG)
    console.log("charlie comp bGc", hex(bGc))
    await camelot23.connect(charlie).step(bGc)
    await camelot23.connect(charlie).done()

    // const cGa = scalarMult(a.secretKey, cG)
    const cG = await camelot23.prep(alice.address).then(([_, k]) => buf(k))
    const cGa = scalarMult(a.secretKey, cG)
    await camelot23.connect(alice).step(cGa)
    await camelot23.connect(alice).done()
    // await _logQueues() //DBG
    const _aGb = await camelot23.prep(charlie.address).then(([_, k]) => buf(k))
    const aGbc = Buffer.from(scalarMult(c.secretKey, _aGb)).toString('hex')
    const _bGc = await camelot23.prep(alice.address).then(([_, k]) => buf(k))
    const bGca = Buffer.from(scalarMult(a.secretKey, _bGc)).toString('hex')
    const _cGa = await camelot23.prep(bob.address).then(([_, k]) => buf(k))
    const cGab = Buffer.from(scalarMult(b.secretKey, _cGa)).toString('hex')

    expect(aGbc).to.equal(bGca)
    expect(bGca).to.equal(cGab)
  })

  //WIP
  it.skip('should yield all similar shared secrets - loops', async function () {
    const { alice, bob, charlie, camelot23, G } =
      await loadFixture(MPX25519Fixture)
    const signers = [alice, bob, charlie]

    async function _logQueues() {
      //DBG
      for (let i = 0; i < signers.length; i++) {
        console.log(
          'queue',
          i,
          'length',
          await camelot23.getQueue(i).then(q => q.length)
        )
      }
      console.log('==================')
    }

    // there are always signers.length - 1 rounds prefinal rounds
    // the output of the final round is the shared secret

    console.log('>>>>>>>1stround begin')
    for (const signer of signers) {
      const kp = await kdf(signer)
      // const share = scalarMult(kp.secretKey, G)
      await camelot23.connect(signer).submit(kp.publicKey)
      // console.log(">>> kp pk", Buffer.from(kp.publicKey).toString("hex"))
      await _logQueues() //DBG
    }
    console.log('>>>>>>>1stround done')

    console.log('>>>>>>>2ndround begin')
    for (const signer of signers) {
      const [status, share] = await camelot23.share(signer.address)
      if (status !== 1n) throw Error('expected status 1 got ' + status)
      // const revshare = Buffer.from(share.replace("0x",""), "hex").reverse()
      console.log('>>> 2nd lop cG', share)
      const kp = await kdf(signer)
      const newShare = scalarMult(kp.secretKey, share)
      console.log('>>> 2nd lop cGa', Buffer.from(newShare).toString('hex'))
      // return
      await camelot23.connect(signer).submit(newShare) //(1, newShare)

      await _logQueues() //DBG
    }
    console.log('>>>>>>>2ndround done')

    // final
    for (const signer of signers) {
      const [status, share] = await camelot23.share(signer.address)
      if (status !== 0n) throw Error('expected status 0 got ' + status)
      else console.log('>>>>>> signer ended')
      console.log('>>> semifinal share', share)
      const kp = await kdf(signer)
      signer.sharedSecret =
        '0x' + Buffer.from(scalarMult(kp.secretKey, share)).toString('hex')
    }

    const sharedSecrets = signers.map(s => s.sharedSecret)
    const expected = sharedSecrets[0]
    console.log('>>> shared secrets', sharedSecrets) //DBG
    expect(sharedSecrets.every(s => s === expected)).to.be.true
  })

  //TODO submit randomly
})
