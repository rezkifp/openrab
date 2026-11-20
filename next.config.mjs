/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pdfmake', 'exceljs', 'pg', '@electric-sql/pglite'],
};

export default nextConfig;
