import { useWeb3ModalAccount, useWeb3ModalProvider } from '@web3modal/ethers/react'
import { BrowserProvider, Contract, ethers, TransactionReceipt } from 'ethers'
import ContentEditable from 'react-contenteditable'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AiOutlineLoading3Quarters } from 'react-icons/ai'
import { ABI } from './network'

const HTML_REGULAR =
  /<(?!img|table|\/table|thead|\/thead|tbody|\/tbody|tr|\/tr|td|\/td|th|\/th|br|\/br).*?>/gi

// const ABI = [/* Your ABI here */];

export const Mint = () => {
  const { walletProvider } = useWeb3ModalProvider()
  const { address, chainId } = useWeb3ModalAccount()

  const textAreaRef = useRef(null)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [isMintingLoading, setIsMintingLoading] = useState(false)
  const [userNfts, setUserNfts] = useState([])
  const [otherNfts, setOtherNfts] = useState([])
  const [isUserNftsLoading, setIsUserNftsLoading] = useState(false)
  const [isOtherNftsLoading, setIsOtherNftsLoading] = useState(false)

  useEffect(() => {
    getUserNfts()
    getOtherNfts()
  }, [chainId])

  const getUserNfts = async () => {
    if (!walletProvider || !address) return
    setIsUserNftsLoading(true)
    const ethersProvider = new BrowserProvider(walletProvider)
    const signer = await ethersProvider.getSigner()
    const contract = new Contract(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '', ABI, signer)
    let indexedUserNfts = []
    for (let i = 0; i < 5; i++) {
      try {
        const token = await contract.tokenOfOwnerByIndex(address, i)
        if (token !== undefined) {
          const tokenUri = await contract.tokenURI(token)
          if (tokenUri) indexedUserNfts = [{ tokenUri }, ...indexedUserNfts]
        }
      } catch (e) {
        break
      }
    }
    setUserNfts(indexedUserNfts)
    setIsUserNftsLoading(false)
  }

  const getOtherNfts = async () => {
    if (!walletProvider || !address) return
    setIsOtherNftsLoading(true)
    const ethersProvider = new BrowserProvider(walletProvider)
    const signer = await ethersProvider.getSigner()
    const contract = new Contract(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '', ABI, signer)
    let indexedNfts = []
    try {
      const totalSupply = await contract.totalSupply()
      for (let i = Number(totalSupply) - 1; i >= 0; i--) {
        try {
          const tokenUri = await contract.tokenURI(i)
          if (tokenUri) indexedNfts = [...indexedNfts, { tokenUri }]
        } catch (e) {
          break
        }
      }
      setOtherNfts(indexedNfts)
    } catch (e) {
      // Handle error
    }
    setIsOtherNftsLoading(false)
  }

  const onMint = useCallback(
    async (e) => {
      const input = (textAreaRef.current?.innerHTML?.replace(HTML_REGULAR, '') || '').replace(
        /(<br\s*\/?>\s*)+$/,
        ''
      )
      if (!walletProvider || !input) return

      setIsLoading(true)
      try {
        const ethersProvider = new BrowserProvider(walletProvider)
        const signer = await ethersProvider.getSigner()
        const contract = new Contract(process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '', ABI, signer)
        const tx = await contract.initializeMint(input)
        const receipt = await tx.wait()
        setMessage('')
        const tokenId = getNftId(receipt, contract)
        if (tokenId !== undefined) {
          setIsMintingLoading(true)
          const tokenUri = await pollTokenUri(contract, tokenId)
          if (tokenUri) {
            setUserNfts([{ tokenUri, txHash: receipt.hash }, ...userNfts])
          }
        }
      } catch (e) {
        // Handle error
      }
      setIsLoading(false)
      setIsMintingLoading(false)
    },
    [walletProvider, isLoading, userNfts]
  )

  const getNftId = (receipt, contract) => {
    let nftId
    for (const log of receipt.logs) {
      try {
        const parsedLog = contract.interface.parseLog(log)
        if (parsedLog && parsedLog.name === 'MintInputCreated') {
          nftId = ethers.toNumber(parsedLog.args[1])
        }
      } catch (error) {
        console.log('Could not parse log:', log)
      }
    }
    return nftId
  }

  const pollTokenUri = async (contract, tokenId) => {
    for (let i = 0; i < 120; i++) {
      try {
        const uri = await contract.tokenURI(tokenId)
        if (uri) return uri
      } catch (e) {
        // Handle error
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  const handleKeypress = useCallback(
    (e) => {
      if (e.keyCode === 13 && !e.shiftKey) {
        onMint(e)
        e.preventDefault()
      }
    },
    [onMint]
  )

  const MintLoading = () => (
    <div className="square-content bg-[#B6B6B6] flex flex-col justify-end text-sm text-black">
      <div className="p-2">Generating & minting image...</div>
      <ProgressBar duration={10} />
    </div>
  )

  const Gallery = ({ isMintingLoading, isLoading, nfts, type }) => (
    <div className="w-full py-6">
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="flex flex-col">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            {isMintingLoading && (
              <div className="md:basis-1/5 square relative">
                <MintLoading />
              </div>
            )}
            {(nfts || []).slice(0, isMintingLoading ? 4 : 5).map((nft, i) => (
              <div key={`nft_${type}_${i}`} className="basis-1/5">
                <img src={nft.tokenUri} alt={`nft_${type}_${i}`} />
                <div className="md:hidden">
                  {nft.txHash && (
                    <div>
                      <a
                        className="underline"
                        href={`https://explorer.galadriel.com/tx/${nft.txHash}`}
                        target="_blank"
                      >
                        {nft.txHash.slice(0, 12)}...
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:flex flex-col md:flex-row gap-10 items-center">
            {(nfts || []).slice(0, isMintingLoading ? 4 : 5).map((nft, i) => (
              <div key={`nft_${type}_${i}`} className="basis-1/5">
                {nft.txHash && (
                  <div>
                    <a
                      className="underline"
                      href={`https://explorer.galadriel.com/tx/${nft.txHash}`}
                      target="_blank"
                    >
                      <div className="hidden lg:block">{nft.txHash.slice(0, 12)}...</div>
                      <div className="block lg:hidden">{nft.txHash.slice(0, 8)}...</div>
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
          {!(nfts || []).length && !isMintingLoading && (
            <div>
              {type === 'other' ? (
                <div>Make sure your wallet RPC URL is https://devnet.galadriel.com/</div>
              ) : (
                <div>No NFTs yet</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="w-full px-2 md:px-20 flex flex-col gap-16">
      <div>
        <div className="pb-4">Start with a detailed description</div>
        <div className="flex flex-row">
          <div
            className="rt-TextAreaRoot rt-r-size-1 rt-variant-surface flex-1 chat-textarea bg-[#002360]"
            style={{ borderBottom: '2px solid white' }}
          >
            <ContentEditable
              innerRef={textAreaRef}
              style={{
                minHeight: '50px',
                maxHeight: '200px',
                overflowY: 'auto',
                fontSize: '18px',
                paddingTop: '13px',
                paddingBottom: '13px'
              }}
              className="rt-TextAreaInput text-base focus:outline-none flex px-2"
              html={message}
              disabled={isLoading}
              onChange={(e) => {
                setMessage(e.target.value.replace(HTML_REGULAR, ''))
              }}
              onKeyDown={(e) => {
                handleKeypress(e)
              }}
            />
            <div className="rt-TextAreaChrome"></div>
          </div>
          <button
            className="flex flex-row items-center gap-2 px-5 py-2 hover:bg-white hover:text-black duration-150 text-black bg-[#0F6] text-4xl"
            onClick={onMint}
          >
            {isLoading && <AiOutlineLoading3Quarters className="animate-spin size-4" />}
            Generate
          </button>
        </div>
      </div>

      <div>
        <div className="text-xl">My NFTs</div>
        <Gallery
          isMintingLoading={isMintingLoading}
          isLoading={isUserNftsLoading}
          nfts={userNfts}
          type="user"
        />
      </div>

      <div>
        <div className="text-xl">Others' NFTs</div>
        <Gallery
          isMintingLoading={false}
          isLoading={isOtherNftsLoading}
          nfts={otherNfts}
          type="other"
        />
      </div>
    </div>
  )
}
