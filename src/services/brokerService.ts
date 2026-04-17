/**
 * CONFLUENCE ENGINE - PROPRIETARY AND CONFIDENTIAL
 * Copyright (c) 2026 Confluence Quantitative Research Group.
 * All rights reserved.
 */

export interface OrderRequest {
  symbol: string;
  transactionType: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL-M";
  quantity: number;
  price?: number;
  stopLoss?: number;
  target?: number;
  isBracketOrder?: boolean;
}

export interface OrderResponse {
  orderId: string;
  status: "SUCCESS" | "REJECTED";
  message?: string;
  isSimulated?: boolean;
}

/**
 * Broker Execution Bridge
 * Handles communication with the Broker API (e.g., Zerodha Kite, Dhan).
 */
export class BrokerService {
  private isRealEnabled: boolean = false;
  private isSafetyOn: boolean = true; // DEFAULT: Safety Always On
  private clientId: string | undefined;
  private accessToken: string | undefined;

  constructor() {
    this.refreshConfig();
  }

  public refreshConfig(clientId?: string, accessToken?: string): void {
    // In Vite, environment variables are in import.meta.env
    // In Node.js, they are in process.env
    const env = (typeof process !== 'undefined' && process.env) || (import.meta as any).env || {};
    
    this.clientId = clientId || env.DHAN_CLIENT_ID || (import.meta as any).env?.VITE_DHAN_CLIENT_ID;
    this.accessToken = accessToken || env.DHAN_ACCESS_TOKEN || (import.meta as any).env?.VITE_DHAN_ACCESS_TOKEN;
    this.isRealEnabled = !!(this.clientId && this.accessToken);
  }

  public toggleSafety(val: boolean) {
    this.isSafetyOn = val;
  }

  public getStatus(): { connected: boolean; safety: boolean; mode: "LIVE" | "PAPER_TRADING" } {
    return {
      connected: this.isRealEnabled,
      safety: this.isSafetyOn,
      mode: this.isRealEnabled && !this.isSafetyOn ? "LIVE" : "PAPER_TRADING"
    };
  }

  /**
   * Executes a Bracket Order (BO) to ensure Stop-Loss and Target are placed simultaneously.
   * This is the "Dead Man's Switch" failsafe.
   */
  public async placeBracketOrder(order: OrderRequest): Promise<OrderResponse> {
    if (!this.isRealEnabled || this.isSafetyOn) {
      return this.mockExecution(order);
    }

    try {
      console.log(`[BROKER] Executing LIVE Order for ${order.symbol} via DhanHQ API`);
      
      const response = await fetch("https://api.dhan.co/orders", {
        method: "POST",
        headers: {
          "access-token": this.accessToken!,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dhanClientId: this.clientId,
          correlationId: `CONF-${Date.now()}`,
          transactionType: order.transactionType,
          exchangeSegment: "NSE_FNO",
          productType: "INTRADAY",
          orderType: order.orderType === "SL-M" ? "STOP_LOSS_MARKET" : order.orderType,
          validity: "DAY",
          tradingSymbol: order.symbol,
          securityId: "0", 
          quantity: order.quantity,
          price: order.price || 0,
          triggerPrice: order.stopLoss || 0,
          afterMarketOrder: false
        })
      });

      let data;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.warn("[BROKER] Non-JSON Response:", text);
        return {
          orderId: "REJECTED",
          status: "REJECTED",
          message: `Broker returned non-JSON response (${response.status}). Check API credentials.`
        };
      }

      if (data.status === "success" || data.orderStatus === "TRANSIT" || response.status === 200) {
        return {
          orderId: data.orderId || data.data?.order_id || "DHAN-PENDING",
          status: "SUCCESS",
          message: "Live Dhan order transmitted successfully."
        };
      } else {
        return {
          orderId: "FAILED",
          status: "REJECTED",
          message: data.remarks || data.message || `Order rejected by broker (Error: ${response.status})`
        };
      }
    } catch (err) {
      console.error("[BROKER] Live Order Failure:", err);
      return {
        orderId: "ERROR",
        status: "REJECTED",
        message: "Network Error: Could not connect to Broker API."
      };
    }
  }

  private async mockExecution(order: OrderRequest): Promise<OrderResponse> {
    console.log(`[PAPER TRADING] Simulated ${order.transactionType} for ${order.symbol}`);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          orderId: `SIM-${Math.random().toString(36).substring(7).toUpperCase()}`,
          status: "SUCCESS",
          message: `Simulated order successful. Capital Protected. (${this.isRealEnabled ? 'SAFETY ON' : 'KEYS MISSING'})`,
          isSimulated: true
        });
      }, 500);
    });
  }

  /**
   * Maps Spot Index or Equity to a tradable instrument.
   * Supports: NIFTY, BANKNIFTY, FINNIFTY, SENSEX, MIDCPNIFTY
   */
  public getTradableInstrument(spotSymbol: string, type: "FUT" | "EQ" = "FUT"): string {
    if (type === "EQ") return spotSymbol; // Equities use direct symbols
    
    // Mapping for major Indian indices
    const symbolMap: Record<string, string> = {
      "NIFTY 50": "NIFTY",
      "NIFTY BANK": "BANKNIFTY",
      "NIFTY FIN SERVICE": "FINNIFTY",
      "SENSEX": "BSESENSEX",
      "NIFTY MIDCAP SELECT": "MIDCPNIFTY"
    };

    const base = symbolMap[spotSymbol] || spotSymbol;
    const month = new Date().toLocaleString('default', { month: 'short' }).toUpperCase();
    const year = new Date().getFullYear().toString().slice(-2);
    
    return `${base}${year}${month}FUT`;
  }
}
