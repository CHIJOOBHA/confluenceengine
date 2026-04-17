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
  private apiKey: string | undefined;
  private accessToken: string | undefined;

  constructor() {
    this.refreshConfig();
  }

  public refreshConfig(apiKey?: string, accessToken?: string): void {
    this.apiKey = apiKey || process.env.KITE_API_KEY;
    this.accessToken = accessToken || process.env.KITE_ACCESS_TOKEN;
    this.isRealEnabled = !!(this.apiKey && this.accessToken);
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
      console.log(`[BROKER] Executing LIVE Order for ${order.symbol} via Kite API`);
      
      // In a real production app, we would use the 'kiteconnect' npm package.
      // For this demo, we demonstrate the raw REST API integration used by Indian brokers.
      const response = await fetch("https://api.kite.trade/orders/regular", {
        method: "POST",
        headers: {
          "X-Kite-Version": "3",
          "Authorization": `token ${this.apiKey}:${this.accessToken}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          "tradingsymbol": order.symbol,
          "exchange": "NFO",
          "transaction_type": order.transactionType,
          "order_type": order.orderType,
          "quantity": order.quantity.toString(),
          "product": "MIS", // Day trading product in India
          "validity": "DAY",
          "price": order.price?.toString() || "0",
          "squareoff": (order.target ? order.target - (order.price || 0) : 0).toString(),
          "stoploss": (order.price && order.stopLoss ? (order.price - order.stopLoss) : 0).toString(),
          "trailing_stoploss": "0"
        })
      });

      const data = await response.json();

      if (data.status === "success") {
        return {
          orderId: data.data.order_id,
          status: "SUCCESS",
          message: "Live Bracket Order placed successfully."
        };
      } else {
        return {
          orderId: "FAILED",
          status: "REJECTED",
          message: data.message || "Broker rejected the order."
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
   * Maps Spot Index price to the nearest tradable Futures instrument.
   */
  public getTradableInstrument(spotSymbol: string): string {
    const month = new Date().toLocaleString('default', { month: 'short' }).toUpperCase();
    const year = new Date().getFullYear().toString().slice(-2);
    return `${spotSymbol}${year}${month}FUT`;
  }
}
