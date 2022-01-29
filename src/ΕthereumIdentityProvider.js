/* eslint-disable no-console */
/* eslint-disable no-return-await */
import IdentityProvider from 'orbit-db-identity-provider';
import { getIdentitySignaturePubKey, storeIdentitySignaturePubKey } from './levelUtils';

const LOGGING_PREFIX = 'EthereumIdentityProvider: ';

class EthereumIdentityProvider extends IdentityProvider {
  constructor(options = {}) {
    if (!EthereumIdentityProvider.web3) {
      throw new Error(`${LOGGING_PREFIX}Couldn't create identity, because web3 wasn't set. `
          + 'Please use setWeb3(web3) first!');
    }

    super(options);

    // Optional (will be grabbed later if omitted)
    const { id } = options;
    if (id){
        //  Set Orbit's Identity Id (user's Ethereum address)
        if (EthereumIdentityProvider.web3.utils.isAddress(id))
          this.id = id;
        else
          throw new Error(`${LOGGING_PREFIX}Couldn't create identity, because an invalid id was supplied.`);
    }
  }

  static get type() { return 'ethereum'; }

  async getId() {
    // Id wasn't in the constructor, grab it now
    if (!this.id) {
      const accounts = await EthereumIdentityProvider.web3.eth.getAccounts();
      if (!accounts[0]) {
        throw new Error(`${LOGGING_PREFIX}Couldn't create identity, because no web3 accounts were found (
                locked Metamask?).`);
      }

      [this.id] = accounts;
    }
    return this.id;
  }

  // Data to be signed is identity.publicKey + identity.signatures.id
  async signIdentity(data) {
    if (EthereumIdentityProvider.storeAuthDataLocally) {
      console.debug(`${LOGGING_PREFIX}Attempting to find stored Orbit identity data...`);
      const signaturePubKey = await getIdentitySignaturePubKey(data);
      if (signaturePubKey) {
        const identity = {
          id: this.id,
          pubKeySignId: data,
          signatures: { publicKey: signaturePubKey },
        };
        if (await EthereumIdentityProvider.verifyIdentity(identity)) {
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
      const signaturePubKey = await EthereumIdentityProvider.web3.eth.personal.sign(data, this.id, '');
      if (EthereumIdentityProvider.storeAuthDataLocally) {
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

  // Verifies that identity was signed by the ID
  static async verifyIdentity(identity) {
    const pubKeySignId = identity.pubKeySignId ? identity.pubKeySignId : identity.publicKey + identity.signatures.id;
    return new Promise((resolve) => {
      resolve(EthereumIdentityProvider.web3.eth.accounts.recover(pubKeySignId,
          identity.signatures.publicKey) === identity.id);
    });
  }

  // Initialize by supplying a web3 object
  static setWeb3(web3) {
    EthereumIdentityProvider.web3 = web3;
  }

  // Opt to store auth data locally to avoid repeating MetaMask signing prompts
  static setStoreAuthDataLocally(storeAuthDataLocally) {
    EthereumIdentityProvider.storeAuthDataLocally = storeAuthDataLocally;
  }
}

EthereumIdentityProvider.web3 = {};

export default EthereumIdentityProvider;
