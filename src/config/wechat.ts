import { siteConfig } from './site';

/**
 * 微信公众号配置。
 *
 * 关于二维码：
 * - 把真实二维码放到 `public/images/wechat/qrcode.webp`（推荐 480×480）。
 * - 未提供图片时显示占位状态，**不会生成假的二维码**。
 */
export interface WechatConfig {
  enabled: boolean;
  name: string;
  description: string;
  /** 相对于 public 目录的图片路径 */
  qrCode: string;
  showOnHome: boolean;
  showOnArticle: boolean;
  /** 二维码下方提示文案 */
  tip: string;
}

export const wechatConfig: WechatConfig = {
  enabled: true,
  name: `${siteConfig.shortName}`,
  description: '编程旅途，漫行记录。 \n记录开源拆解、线上翻车、工具折腾、架构脑洞。',
  qrCode: '/images/wechat/qrcode_for_gh_10e8400b2bfb_860.jpg',
  showOnHome: true,
  showOnArticle: true,
  tip: '微信扫码关注',
};

/** 二维码图片是否存在由构建时探测，缺失时显示占位状态 */
export const hasQrCode = false;
