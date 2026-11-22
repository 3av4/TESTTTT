import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // السماح لطلبات المعاينة (بيئات الاستضافة المؤقتة) بالوصول إلى أصول التطوير
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.e2b.app"],
  outputFileTracingIncludes: {},
};

export default nextConfig;
