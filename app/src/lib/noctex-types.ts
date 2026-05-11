/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/noctex.json`.
 */
export type Noctex = {
  "address": "833YAgrbapXnLiYkUq6tG6hWfZ7whX34Xs7CtBN8Nrvx",
  "metadata": {
    "name": "noctex",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Encrypted dark pool DEX — Noctex"
  },
  "instructions": [
    {
      "name": "cancelOrder",
      "docs": [
        "Cancel a pending order (only the owner can cancel, only while Pending)."
      ],
      "discriminator": [
        95,
        129,
        237,
        240,
        8,
        49,
        223,
        132
      ],
      "accounts": [
        {
          "name": "order",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true,
          "relations": [
            "order"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "executeMatch",
      "docs": [
        "Run the FHE match graph between a buy and a sell order.",
        "",
        "CPIs into the Encrypt program via the auto-generated `match_orders`",
        "method on `EncryptContext` (see fhe.rs). Inputs are the buyer's and",
        "seller's encrypted price/amount ciphertexts (passed by pubkey, verified",
        "against the Order PDAs). Outputs are three freshly-allocated",
        "CiphertextAccounts that the Encrypt executor writes into:",
        "- fill_buyer_ct, fill_seller_ct, exec_price_ct",
        "",
        "After the CPI completes, the resulting ciphertext pubkeys are persisted",
        "on each Order PDA so settle_match / decryption can find them later:",
        "buy_order : output_price = exec_price, output_amount = fill_buyer",
        "sell_order: output_price = exec_price, output_amount = fill_seller",
        "",
        "`cpi_authority_bump` is taken as an arg (cheaper than re-deriving the",
        "PDA every call); on mismatch invoke_signed will fail-fast."
      ],
      "discriminator": [
        76,
        47,
        91,
        223,
        20,
        10,
        147,
        232
      ],
      "accounts": [
        {
          "name": "buyOrder",
          "writable": true
        },
        {
          "name": "sellOrder",
          "writable": true
        },
        {
          "name": "buyPriceCt",
          "writable": true
        },
        {
          "name": "sellPriceCt",
          "writable": true
        },
        {
          "name": "buyAmountCt",
          "writable": true
        },
        {
          "name": "sellAmountCt",
          "writable": true
        },
        {
          "name": "fillBuyerCt",
          "writable": true
        },
        {
          "name": "fillSellerCt",
          "writable": true
        },
        {
          "name": "execPriceCt",
          "writable": true
        },
        {
          "name": "encryptProgram"
        },
        {
          "name": "encryptConfig",
          "writable": true
        },
        {
          "name": "encryptDeposit",
          "writable": true
        },
        {
          "name": "encryptCpiAuthority",
          "docs": [
            "Bump is passed as instruction arg; invoke_signed fails on mismatch."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  110,
                  99,
                  114,
                  121,
                  112,
                  116,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "callerProgram"
        },
        {
          "name": "networkEncryptionKey"
        },
        {
          "name": "encryptEventAuthority"
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "cpiAuthorityBump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "finalizeSettlement",
      "docs": [
        "Verify the Ika 2PC-MPC signature on a settlement and transition both",
        "orders from Settled to Finalized. This is the gate that makes Ika",
        "load-bearing: no Settled → Finalized advancement without a valid",
        "signature published in the MessageApproval account by the Ika network.",
        "",
        "Checks (against the layout in Ika's `verify-signature.md` tutorial):",
        "1. message_approval matches the pubkey sign_settlement bound to the",
        "Orders — prevents swapping in a signature for a different match.",
        "2. message_approval is owned by the Ika program — only Ika can write",
        "`status = Signed` and the signature bytes.",
        "3. byte[172] (status) == 1 (Signed).",
        "4. bytes[173..175] (signature_len LE u16) > 0 and the slice fits.",
        "5. (Implicit) The MessageApproval PDA seeds bind the signature to a",
        "specific (dwallet, scheme, message_digest), so the existence of",
        "this signed account proves Ika committed to that exact digest.",
        "",
        "Cryptographic verify (ed25519/secp256k1 against `dwallet_public_key`)",
        "is intentionally deferred — the pre-alpha mock signer commits an",
        "all-zero signature, so a real verifier would always fail on devnet.",
        "The structural gate above is the meaningful production constraint."
      ],
      "discriminator": [
        220,
        72,
        152,
        119,
        178,
        196,
        25,
        170
      ],
      "accounts": [
        {
          "name": "buyOrder",
          "writable": true
        },
        {
          "name": "sellOrder",
          "writable": true
        },
        {
          "name": "messageApproval",
          "docs": [
            "- key matches the pubkey stored on the Orders by sign_settlement",
            "- owner is the Ika program (only it can write the Signed status)",
            "- byte[139] == 1 (Signed) and byte[140..142] is a non-zero sig_len"
          ]
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "initializeDwallet",
      "docs": [
        "Initialize the dWallet config PDA. Records the Ika dWallet ID this",
        "program will sign settlements for, plus the bumps for both the config",
        "PDA and the CPI-authority PDA whose seed is `b\"__ika_cpi_authority\"`.",
        "Run once after deployment; the Ika dWallet should already have had",
        "its authority transferred to the cpi_authority PDA off-chain via Ika's",
        "own client (using the same seed)."
      ],
      "discriminator": [
        169,
        255,
        150,
        171,
        50,
        158,
        61,
        157
      ],
      "accounts": [
        {
          "name": "dwalletConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "cpiAuthority",
          "docs": [
            "must have been transferred to this address off-chain so that only",
            "this program can approve messages on it."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  105,
                  107,
                  97,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "dwalletId",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "settleMatch",
      "docs": [
        "Finalize a matched pair: transition both orders from Matching to",
        "Settled. The output ciphertext pubkeys were already written by",
        "`execute_match` after the FHE CPI committed; this instruction just",
        "records that both sides agree to settle on those ciphertexts. The",
        "subsequent `sign_settlement` + `finalize_settlement` flow then drives",
        "the Ika 2PC-MPC signature over the settlement digest."
      ],
      "discriminator": [
        71,
        124,
        117,
        96,
        191,
        217,
        116,
        24
      ],
      "accounts": [
        {
          "name": "buyOrder",
          "writable": true
        },
        {
          "name": "sellOrder",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "signSettlement",
      "docs": [
        "Sign a settlement message via the Ika dWallet. CPIs into Ika's",
        "`approve_message` (discriminator 8); creates a MessageApproval PDA",
        "with status=Pending. The Ika network produces the 2PC-MPC signature",
        "off-chain and the NOA writes it back via CommitSignature.",
        "",
        "`message_approval` must be the PDA address derived per Ika's seeds",
        "(computed client-side); `message_approval_bump` is its bump."
      ],
      "discriminator": [
        248,
        106,
        168,
        68,
        73,
        154,
        171,
        250
      ],
      "accounts": [
        {
          "name": "dwalletConfig",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "buyOrder",
          "writable": true
        },
        {
          "name": "sellOrder",
          "writable": true
        },
        {
          "name": "coordinator"
        },
        {
          "name": "messageApproval",
          "docs": [
            "from this transaction. Address derived client-side per Ika seeds."
          ],
          "writable": true
        },
        {
          "name": "dwallet"
        },
        {
          "name": "callerProgram",
          "docs": [
            "Ika's approve_message verifies executable=true."
          ]
        },
        {
          "name": "cpiAuthority",
          "docs": [
            "Bump is taken from dwallet_config rather than re-derived to avoid",
            "PDA-derivation cost in this hot path."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  105,
                  107,
                  97,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "ikaProgram"
        }
      ],
      "args": [
        {
          "name": "messageApprovalBump",
          "type": "u8"
        },
        {
          "name": "messageDigest",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "messageMetadataDigest",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "userPubkey",
          "type": "pubkey"
        },
        {
          "name": "signatureScheme",
          "type": "u16"
        }
      ]
    },
    {
      "name": "submitOrder",
      "docs": [
        "Submit an encrypted order to the dark pool.",
        "`encrypted_price` and `encrypted_amount` are pubkeys of CiphertextAccounts",
        "created by the client (via the Encrypt gRPC executor) BEFORE this call."
      ],
      "discriminator": [
        230,
        150,
        200,
        53,
        92,
        208,
        109,
        108
      ],
      "accounts": [
        {
          "name": "order",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "nonce",
          "type": "u64"
        },
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "orderSide"
            }
          }
        },
        {
          "name": "encryptedPrice",
          "type": "pubkey"
        },
        {
          "name": "encryptedAmount",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateDwalletId",
      "docs": [
        "Refresh the recorded dWallet ID (and CPI-authority bump if changed).",
        "Useful when re-running DKG: a fresh dWallet ID needs to replace the",
        "old one without recreating the DWalletConfig PDA. Only the authority",
        "that initialized the config can update it."
      ],
      "discriminator": [
        142,
        62,
        155,
        127,
        184,
        15,
        50,
        41
      ],
      "accounts": [
        {
          "name": "dwalletConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  119,
                  97,
                  108,
                  108,
                  101,
                  116,
                  45,
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "cpiAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  105,
                  107,
                  97,
                  95,
                  99,
                  112,
                  105,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "newDwalletId",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "dWalletConfig",
      "discriminator": [
        85,
        20,
        89,
        158,
        139,
        232,
        63,
        144
      ]
    },
    {
      "name": "order",
      "discriminator": [
        134,
        173,
        223,
        185,
        77,
        86,
        28,
        51
      ]
    }
  ],
  "events": [
    {
      "name": "dWalletInitialized",
      "discriminator": [
        15,
        0,
        170,
        156,
        18,
        244,
        34,
        158
      ]
    },
    {
      "name": "matchInitiated",
      "discriminator": [
        163,
        29,
        226,
        80,
        23,
        222,
        199,
        33
      ]
    },
    {
      "name": "matchSettled",
      "discriminator": [
        243,
        201,
        134,
        151,
        193,
        131,
        223,
        150
      ]
    },
    {
      "name": "orderCancelled",
      "discriminator": [
        108,
        56,
        128,
        68,
        168,
        113,
        168,
        239
      ]
    },
    {
      "name": "orderSubmitted",
      "discriminator": [
        234,
        9,
        195,
        214,
        22,
        135,
        46,
        248
      ]
    },
    {
      "name": "settlementFinalized",
      "discriminator": [
        95,
        186,
        111,
        179,
        117,
        162,
        152,
        217
      ]
    },
    {
      "name": "settlementSigned",
      "discriminator": [
        53,
        198,
        159,
        102,
        27,
        131,
        229,
        65
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "orderNotPending",
      "msg": "Order must be Pending to execute match"
    },
    {
      "code": 6001,
      "name": "orderNotMatching",
      "msg": "Order must be in Matching state to settle"
    },
    {
      "code": 6002,
      "name": "orderNotSettled",
      "msg": "Order must be Settled before signing settlement"
    },
    {
      "code": 6003,
      "name": "wrongOrderSide",
      "msg": "Wrong order side for this operation"
    },
    {
      "code": 6004,
      "name": "orderMismatch",
      "msg": "Orders do not match each other"
    },
    {
      "code": 6005,
      "name": "orderNotCancellable",
      "msg": "Only pending orders can be cancelled"
    },
    {
      "code": 6006,
      "name": "unauthorized",
      "msg": "Unauthorized — not the order owner"
    },
    {
      "code": 6007,
      "name": "ciphertextMismatch",
      "msg": "Ciphertext account does not match the one recorded on the Order PDA"
    },
    {
      "code": 6008,
      "name": "messageApprovalMismatch",
      "msg": "MessageApproval account does not match the one recorded on the Orders"
    },
    {
      "code": 6009,
      "name": "messageApprovalNotIkaOwned",
      "msg": "MessageApproval account is not owned by the Ika program"
    },
    {
      "code": 6010,
      "name": "messageApprovalMalformed",
      "msg": "MessageApproval account is too short or malformed"
    },
    {
      "code": 6011,
      "name": "settlementNotSigned",
      "msg": "MessageApproval status is not Signed yet — Ika network has not finalized"
    },
    {
      "code": 6012,
      "name": "settlementSignatureMissing",
      "msg": "MessageApproval reports Signed but signature length is zero"
    }
  ],
  "types": [
    {
      "name": "dWalletConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "dwalletId",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "cpiAuthorityBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "dWalletInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "dwalletId",
            "type": "pubkey"
          },
          {
            "name": "cpiAuthority",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "matchInitiated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "buyOrder",
            "type": "pubkey"
          },
          {
            "name": "sellOrder",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "matchSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "buyOrder",
            "type": "pubkey"
          },
          {
            "name": "sellOrder",
            "type": "pubkey"
          },
          {
            "name": "outputPrice",
            "type": "pubkey"
          },
          {
            "name": "outputAmount",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "order",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "orderSide"
              }
            }
          },
          {
            "name": "encryptedPrice",
            "type": "pubkey"
          },
          {
            "name": "encryptedAmount",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "orderStatus"
              }
            }
          },
          {
            "name": "matchedWith",
            "type": "pubkey"
          },
          {
            "name": "outputPrice",
            "type": "pubkey"
          },
          {
            "name": "outputAmount",
            "type": "pubkey"
          },
          {
            "name": "messageApproval",
            "docs": [
              "MessageApproval PDA address recorded by sign_settlement so",
              "finalize_settlement can match the account it's verifying against.",
              "Default::default() until sign_settlement runs."
            ],
            "type": "pubkey"
          },
          {
            "name": "nonce",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "orderCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderSide",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buy"
          },
          {
            "name": "sell"
          }
        ]
      }
    },
    {
      "name": "orderStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "matching"
          },
          {
            "name": "settled"
          },
          {
            "name": "cancelled"
          },
          {
            "name": "finalized"
          }
        ]
      }
    },
    {
      "name": "orderSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "orderSide"
              }
            }
          },
          {
            "name": "encryptedPrice",
            "type": "pubkey"
          },
          {
            "name": "encryptedAmount",
            "type": "pubkey"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "settlementFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "buyOrder",
            "type": "pubkey"
          },
          {
            "name": "sellOrder",
            "type": "pubkey"
          },
          {
            "name": "messageApproval",
            "type": "pubkey"
          },
          {
            "name": "signatureLen",
            "type": "u16"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "settlementSigned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "buyOrder",
            "type": "pubkey"
          },
          {
            "name": "sellOrder",
            "type": "pubkey"
          },
          {
            "name": "dwalletId",
            "type": "pubkey"
          },
          {
            "name": "messageApproval",
            "type": "pubkey"
          },
          {
            "name": "messageDigest",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    }
  ]
};
