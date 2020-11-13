/* eslint-disable no-console */
/* eslint-disable no-return-await */
import IdentityProvider from 'orbit-db-identity-provider';
import { getIdentitySignaturePubKey, storeIdentitySignaturePubKey } from './levelUtils';

const LOGGING_PREFIX = 'EthereumContractIdentityProvider: ';

class EthereumContractIdentityProvider extends IdentityProvider {
  constructor(options = {}) {
    if (!EthereumContractIdentityProvider.web3) {
      throw new Error(`${LOGGING_PREFIX}Couldn't create identity, because web3 wasn't set. `
          + 'Please use setWeb3(web3) first!');
    }

    if (!EthereumContractIdentityProvider.contractAddress) {
      throw new Error(`${LOGGING_PREFIX}Couldn't create identity, because contractAddress wasn't set. `
          + 'Please use setContractAddress(contractAddress) first!');
    }

    super(options);

    // Optional (will be grabbed later if omitted)
    const { id } = options;
    if (id) {
      //  Set Orbit's Identity Id (user's Ethereum address + contract's address)
      const { userAddress, contractAddress } = EthereumContractIdentityProvider.splitId(id);
      if (EthereumContractIdentityProvider.web3.utils.isAddress(userAddress)
          && EthereumContractIdentityProvider.contractAddress === contractAddress) {
        this.id = id;
        this.userAddress = userAddress;
      }
      else
        throw new Error(`${LOGGING_PREFIX}Couldn't create identity, because an invalid id was supplied.`);
    }
  }

  static get type() { return 'ethereum'; }

  async getId() {
    // Id wasn't in the constructor, grab it now
    if (!this.id) {
      const accounts = await EthereumContractIdentityProvider.web3.eth.getAccounts();
      if (!accounts[0]) {
        throw new Error(`${LOGGING_PREFIX}Couldn't create identity, because no web3 accounts were found (
                locked Metamask?).`);
      }
      [this.userAddress] = accounts;
      this.id = this.userAddress + EthereumContractIdentityProvider.contractAddress;
    }
    return this.id;
  }

  async signIdentity(data) {
    if (process.env.NODE_ENV === 'development') { // Don't sign repeatedly while in development
      console.debug(`${LOGGING_PREFIX}Attempting to find stored Orbit identity data...`);
      const signaturePubKey = await getIdentitySignaturePubKey(data);
      if (signaturePubKey) {
        const identity = {
          userAddress: this.userAddress,
          pubKeySignId: data,
          signatures: { publicKey: signaturePubKey },
        };
        if (await EthereumContractIdentityProvider.verifyIdentity(identity)) {
          console.debug(`${LOGGING_PREFIX}Found and verified stored Orbit identity data!`);
          return signaturePubKey;
        }
        console.debug(`${LOGGING_PREFIX}Stored Orbit identity data couldn't be verified.`);
      } else console.debug(`${LOGGING_PREFIX}No stored Orbit identity data were found.`);
    }
    return await this.doSignIdentity(data);
  }

  // eslint-disable-next-line consistent-return
  async doSignIdentity(data) {
    try {
      const signaturePubKey = await EthereumContractIdentityProvider.web3.eth.personal.sign(data, this.userAddress, '');
      if (process.env.NODE_ENV === 'development') {
        storeIdentitySignaturePubKey(data, signaturePubKey)
            .then(() => {
              console.debug(`${LOGGING_PREFIX}Successfully stored current Orbit identity data.`);
            })
            .catch(() => {
              console.warn(`${LOGGING_PREFIX}Couldn't store current Orbit identity data...`);
            });
      }
      return signaturePubKey; // Password not required for MetaMask
    } catch (error) {
      if (error.code && error.code === 4001) {
        console.debug(`${LOGGING_PREFIX}User denied message signature.`);
        return await this.doSignIdentity(data);
      }

      console.error(`${LOGGING_PREFIX}Failed to sign data.`);
      console.error(error);
    }
  }

  static async verifyIdentity(identity) {
    const pubKeySignId = identity.pubKeySignId ? identity.pubKeySignId : identity.publicKey + identity.signatures.id;
    const { userAddress } = identity.userAddress ? identity: EthereumContractIdentityProvider.splitId(identity.id);

    // Verify that identity was signed by the ID
    return new Promise((resolve) => {
      resolve(EthereumContractIdentityProvider.web3.eth.accounts.recover(pubKeySignId,
          identity.signatures.publicKey) === userAddress);
    });
  }

  // Initialize by supplying a web3 object
  static setWeb3(web3) {
    EthereumContractIdentityProvider.web3 = web3;
  }

  // Initialize by supplying a contract's address (to be used as a point of reference)
  static setContractAddress(contractAddress) {
    EthereumContractIdentityProvider.contractAddress = contractAddress;
  }

  static splitId(id) {
    const regex = /(0x.*)(0x.*)/g;
    const match = regex.exec(id);
    if (match && match.length === 3)
      return { userAddress: match[1], contractAddress: match[2] };
    throw new Error(`${LOGGING_PREFIX}Invalid id ${id}! Couldn't split it to userAddress, contractAddress.`);
  }
}

EthereumContractIdentityProvider.web3 = {};
EthereumContractIdentityProvider.contractAddress = {};

export default EthereumContractIdentityProvider;
