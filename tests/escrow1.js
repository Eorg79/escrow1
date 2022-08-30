"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var anchor = require("@project-serum/anchor");
var spl = require("@solana/spl-token");
describe("escrow1", function () { return __awaiter(void 0, void 0, void 0, function () {
    var provider, program, initializer, taker, initializerTokenAccount, newMint;
    return __generator(this, function (_a) {
        provider = anchor.AnchorProvider.local();
        anchor.setProvider(provider);
        program = anchor.workspace.Escrow1;
        initializer = anchor.web3.Keypair.generate();
        taker = anchor.web3.Keypair.generate();
        newMint = function (connection) { return __awaiter(void 0, void 0, void 0, function () {
            var tokenMint, lamportsForMint, tx, signature;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tokenMint = anchor.web3.Keypair.generate();
                        return [4 /*yield*/, provider.connection.getMinimumBalanceForRentExemption(spl.MintLayout.span)];
                    case 1:
                        lamportsForMint = _a.sent();
                        tx = new anchor.web3.Transaction();
                        tx.add(anchor.web3.SystemProgram.createAccount({
                            programId: spl.TOKEN_PROGRAM_ID,
                            space: spl.MintLayout.span,
                            fromPubkey: provider.wallet.publicKey,
                            newAccountPubkey: tokenMint.publicKey,
                            lamports: lamportsForMint
                        }));
                        tx.add(spl.createInitializeMintInstruction(tokenMint.publicKey, 40, provider.wallet.publicKey, provider.wallet.publicKey, spl.TOKEN_PROGRAM_ID));
                        return [4 /*yield*/, provider.sendAndConfirm(tx, [tokenMint])];
                    case 2:
                        signature = _a.sent();
                        console.log("[".concat(tokenMint.publicKey, "] New mint account created ").concat(signature));
                        return [2 /*return*/, tokenMint.publicKey];
                }
            });
        }); };
        return [2 /*return*/];
    });
}); });
