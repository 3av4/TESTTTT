/**
 * روابط تُعرض في رسائل البوت.
 */
import { config } from "../config.js";

export const LOGIN_URL_PLACEHOLDER = config.APP_URL.startsWith("http") ? config.APP_URL : "https://example.com";

export const websiteUrl = () => config.APP_URL;
