import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import {
  ahspCompositions,
  db,
  masterAhsp,
  masterResources,
  pool,
  projects,
  projectTakeoffs,
  projectWbs,
  regions,
  resourcePrices,
} from './index';

// Legacy DUMMY seed IDs (dinonaktifkan secara aman tanpa menghapus FK / snapshot lama)
const LEGACY_DUMMY_REGIONS = [
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
];
const LEGACY_DUMMY_RESOURCES = [
  '22222222-2222-4222-8222-222222222201',
  '22222222-2222-4222-8222-222222222202',
  '22222222-2222-4222-8222-222222222203',
  '22222222-2222-4222-8222-222222222204',
];
const LEGACY_DUMMY_AHSPS = ['44444444-4444-4444-8444-444444444401'];

// Master Data QS Asli (Region: DKI Jakarta & Sekitarnya, 2026)
export const QS_SEED_IDS = {
  regionJakarta: '11111111-1111-4111-8111-111111111201',
  regionJabar: '11111111-1111-4111-8111-111111111202',

  resBata: '22222222-2222-4222-8222-222222222301',
  resSemen: '22222222-2222-4222-8222-222222222302',
  resPasir: '22222222-2222-4222-8222-222222222303',
  resPekerja: '22222222-2222-4222-8222-222222222304',
  resTukang: '22222222-2222-4222-8222-222222222305',
  resKepala: '22222222-2222-4222-8222-222222222306',
  resMandor: '22222222-2222-4222-8222-222222222307',

  // Starter Multi-Divisi Arsitektur Resources (sesuaikan harga/koefisien di Master Data)
  resBatuKali: '22222222-2222-4222-8222-222222222308',
  resSplit: '22222222-2222-4222-8222-222222222309',
  resPasirBeton: '22222222-2222-4222-8222-222222222310',
  resBesiPolos: '22222222-2222-4222-8222-222222222311',
  resKawatBeton: '22222222-2222-4222-8222-222222222312',
  resKayuBekisting: '22222222-2222-4222-8222-222222222313',
  resPaku: '22222222-2222-4222-8222-222222222314',
  resKeramik60: '22222222-2222-4222-8222-222222222315',
  resSemenNat: '22222222-2222-4222-8222-222222222316',
  resGypsum: '22222222-2222-4222-8222-222222222317',
  resHollow: '22222222-2222-4222-8222-222222222318',
  resCatTembok: '22222222-2222-4222-8222-222222222319',
  resPlamir: '22222222-2222-4222-8222-222222222320',
  resBajaRinganC75: '22222222-2222-4222-8222-222222222321',
  resRengBaja: '22222222-2222-4222-8222-222222222322',
  resGentengMetal: '22222222-2222-4222-8222-222222222323',
  resKabelNym: '22222222-2222-4222-8222-222222222324',
  resPipaPvc: '22222222-2222-4222-8222-222222222325',
  resTukangKayu: '22222222-2222-4222-8222-222222222326',
  resTukangBesi: '22222222-2222-4222-8222-222222222327',
  resTukangCat: '22222222-2222-4222-8222-222222222328',
  resTukangListrik: '22222222-2222-4222-8222-222222222329',
  resMolen: '22222222-2222-4222-8222-222222222330',

  ahsp01Dinding: '44444444-4444-4444-8444-444444444501',
  ahsp02Plesteran: '44444444-4444-4444-8444-444444444502',
  ahsp03Bowplank: '44444444-4444-4444-8444-444444444503',
  ahsp04Galian: '44444444-4444-4444-8444-444444444504',
  ahsp05Pondasi: '44444444-4444-4444-8444-444444444505',
  ahsp06BetonK225: '44444444-4444-4444-8444-444444444506',
  ahsp07Pembesian: '44444444-4444-4444-8444-444444444507',
  ahsp08Bekisting: '44444444-4444-4444-8444-444444444508',
  ahsp09Acian: '44444444-4444-4444-8444-444444444509',
  ahsp10Keramik60: '44444444-4444-4444-8444-444444444510',
  ahsp11PlafonGypsum: '44444444-4444-4444-8444-444444444511',
  ahsp12RangkaAtap: '44444444-4444-4444-8444-444444444512',
  ahsp13PenutupAtap: '44444444-4444-4444-8444-444444444513',
  ahsp14CatDinding: '44444444-4444-4444-8444-444444444514',
  ahsp15TitikLampu: '44444444-4444-4444-8444-444444444515',
  ahsp16PipaAir: '44444444-4444-4444-8444-444444444516',

  projectGolden: '66666666-6666-4666-8666-666666666602',
  wbsArsitektur: '77777777-7777-4777-8777-777777777801',
  wbsDindingPlesteran: '77777777-7777-4777-8777-777777777802',
  takeoffDinding: '88888888-8888-4888-8888-888888888901',
  takeoffPlesteran: '88888888-8888-4888-8888-888888888902',
} as const;

async function main() {
  // 0. Soft-nonaktifkan master DUMMY lama bila ada agar master aktif bersih dari label DUMMY
  await db
    .update(regions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(inArray(regions.id, LEGACY_DUMMY_REGIONS));

  await db
    .update(masterResources)
    .set({ isActive: false, updatedAt: new Date() })
    .where(inArray(masterResources.id, LEGACY_DUMMY_RESOURCES));

  await db
    .update(masterAhsp)
    .set({ isActive: false, updatedAt: new Date() })
    .where(inArray(masterAhsp.id, LEGACY_DUMMY_AHSPS));

  // 1. Wilayah (Regions)
  await db
    .insert(regions)
    .values([
      {
        id: QS_SEED_IDS.regionJakarta,
        name: 'DKI Jakarta & Sekitarnya',
        isActive: true,
      },
      {
        id: QS_SEED_IDS.regionJabar,
        name: 'Jawa Barat (Depok - Bogor - Bekasi)',
        isActive: true,
      },
    ])
    .onConflictDoNothing();

  // 2. Master Resources (Data QS Tervalidasi + Starter Multi-Divisi Arsitektur)
  await db
    .insert(masterResources)
    .values([
      { id: QS_SEED_IDS.resBata, code: 'M-BATA', name: 'Bata Merah', type: 'MATERIAL', unit: 'Buah', isActive: true },
      { id: QS_SEED_IDS.resSemen, code: 'M-SEMEN', name: 'Semen Portland', type: 'MATERIAL', unit: 'Kg', isActive: true },
      { id: QS_SEED_IDS.resPasir, code: 'M-PASIR', name: 'Pasir Pasang', type: 'MATERIAL', unit: 'm3', isActive: true },
      { id: QS_SEED_IDS.resPekerja, code: 'L-PEKERJA', name: 'Pekerja', type: 'LABOR', unit: 'OH', isActive: true },
      { id: QS_SEED_IDS.resTukang, code: 'L-TUKANG', name: 'Tukang Batu', type: 'LABOR', unit: 'OH', isActive: true },
      { id: QS_SEED_IDS.resKepala, code: 'L-KEPALA', name: 'Kepala Tukang', type: 'LABOR', unit: 'OH', isActive: true },
      { id: QS_SEED_IDS.resMandor, code: 'L-MANDOR', name: 'Mandor', type: 'LABOR', unit: 'OH', isActive: true },

      // STARTER CATALOG TEMPLATE - SESUAIKAN HARGA & KOEFISIEN DI MASTER DATA
      { id: QS_SEED_IDS.resBatuKali, code: 'M-BATUKALI', name: 'Batu Belah / Batu Kali', type: 'MATERIAL', unit: 'm3', isActive: true },
      { id: QS_SEED_IDS.resSplit, code: 'M-SPLIT', name: 'Koral / Split Pecah 2/3', type: 'MATERIAL', unit: 'm3', isActive: true },
      { id: QS_SEED_IDS.resPasirBeton, code: 'M-PASIR-BTN', name: 'Pasir Beton', type: 'MATERIAL', unit: 'm3', isActive: true },
      { id: QS_SEED_IDS.resBesiPolos, code: 'M-BESI', name: 'Besi Beton Polos / Ulir', type: 'MATERIAL', unit: 'Kg', isActive: true },
      { id: QS_SEED_IDS.resKawatBeton, code: 'M-KAWAT', name: 'Kawat Beton / Bendrat', type: 'MATERIAL', unit: 'Kg', isActive: true },
      { id: QS_SEED_IDS.resKayuBekisting, code: 'M-KAYU-BKS', name: 'Kayu Kelas III / Papan Bekisting', type: 'MATERIAL', unit: 'm3', isActive: true },
      { id: QS_SEED_IDS.resPaku, code: 'M-PAKU', name: 'Paku Biasa 2" - 5"', type: 'MATERIAL', unit: 'Kg', isActive: true },
      { id: QS_SEED_IDS.resKeramik60, code: 'M-GRANIT-60', name: 'Homogeneous Tile / Granit 60x60', type: 'MATERIAL', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.resSemenNat, code: 'M-NAT', name: 'Semen Warna / Nat Keramik', type: 'MATERIAL', unit: 'Kg', isActive: true },
      { id: QS_SEED_IDS.resGypsum, code: 'M-GYPSUM', name: 'Papan Gypsumboard 9 mm', type: 'MATERIAL', unit: 'Lembar', isActive: true },
      { id: QS_SEED_IDS.resHollow, code: 'M-HOLLOW', name: 'Rangka Besi Hollow Galvanis 40x40', type: 'MATERIAL', unit: 'm1', isActive: true },
      { id: QS_SEED_IDS.resCatTembok, code: 'M-CAT-INT', name: 'Cat Tembok Interior', type: 'MATERIAL', unit: 'Kg', isActive: true },
      { id: QS_SEED_IDS.resPlamir, code: 'M-PLAMIR', name: 'Plamir / Cat Dasar Alkali', type: 'MATERIAL', unit: 'Kg', isActive: true },
      { id: QS_SEED_IDS.resBajaRinganC75, code: 'M-CNP-75', name: 'Kanal C Baja Ringan C75.75', type: 'MATERIAL', unit: 'm1', isActive: true },
      { id: QS_SEED_IDS.resRengBaja, code: 'M-RENG', name: 'Reng Baja Ringan', type: 'MATERIAL', unit: 'm1', isActive: true },
      { id: QS_SEED_IDS.resGentengMetal, code: 'M-ATAP-MTL', name: 'Penutup Atap Genteng Metal Berpasir', type: 'MATERIAL', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.resKabelNym, code: 'M-KABEL-NYM', name: 'Kabel NYM 3x2.5 mm + Conduit', type: 'MATERIAL', unit: 'm1', isActive: true },
      { id: QS_SEED_IDS.resPipaPvc, code: 'M-PIPA-AW34', name: 'Pipa PVC Tipe AW dia. 3/4"', type: 'MATERIAL', unit: 'm1', isActive: true },
      { id: QS_SEED_IDS.resTukangKayu, code: 'L-TK-KAYU', name: 'Tukang Kayu', type: 'LABOR', unit: 'OH', isActive: true },
      { id: QS_SEED_IDS.resTukangBesi, code: 'L-TK-BESI', name: 'Tukang Besi', type: 'LABOR', unit: 'OH', isActive: true },
      { id: QS_SEED_IDS.resTukangCat, code: 'L-TK-CAT', name: 'Tukang Cat', type: 'LABOR', unit: 'OH', isActive: true },
      { id: QS_SEED_IDS.resTukangListrik, code: 'L-TK-LISTRIK', name: 'Tukang Listrik / Plumbing', type: 'LABOR', unit: 'OH', isActive: true },
      { id: QS_SEED_IDS.resMolen, code: 'E-MOLEN', name: 'Sewa Concrete Mixer (Molen)', type: 'EQUIPMENT', unit: 'Hari', isActive: true },
    ])
    .onConflictDoNothing();

  // 3. Harga Efektif Regional (DKI Jakarta & Sekitarnya, 2026)
  await db
    .insert(resourcePrices)
    .values([
      // Harga QS Tervalidasi (Test 8)
      { resourceId: QS_SEED_IDS.resBata, regionId: QS_SEED_IDS.regionJakarta, basePrice: '850.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resBata, regionId: QS_SEED_IDS.regionJakarta, basePrice: '900.00', effectiveDate: '2026-06-01' },
      { resourceId: QS_SEED_IDS.resSemen, regionId: QS_SEED_IDS.regionJakarta, basePrice: '1600.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resPasir, regionId: QS_SEED_IDS.regionJakarta, basePrice: '300000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resPekerja, regionId: QS_SEED_IDS.regionJakarta, basePrice: '150000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resTukang, regionId: QS_SEED_IDS.regionJakarta, basePrice: '200000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resKepala, regionId: QS_SEED_IDS.regionJakarta, basePrice: '220000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resMandor, regionId: QS_SEED_IDS.regionJakarta, basePrice: '250000.00', effectiveDate: '2026-01-01' },

      // STARTER CATALOG TEMPLATE PRICES - SESUAIKAN HARGA PASAR REGIONAL
      { resourceId: QS_SEED_IDS.resBatuKali, regionId: QS_SEED_IDS.regionJakarta, basePrice: '340000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resSplit, regionId: QS_SEED_IDS.regionJakarta, basePrice: '360000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resPasirBeton, regionId: QS_SEED_IDS.regionJakarta, basePrice: '320000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resBesiPolos, regionId: QS_SEED_IDS.regionJakarta, basePrice: '14500.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resKawatBeton, regionId: QS_SEED_IDS.regionJakarta, basePrice: '22000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resKayuBekisting, regionId: QS_SEED_IDS.regionJakarta, basePrice: '2800000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resPaku, regionId: QS_SEED_IDS.regionJakarta, basePrice: '20000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resKeramik60, regionId: QS_SEED_IDS.regionJakarta, basePrice: '185000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resSemenNat, regionId: QS_SEED_IDS.regionJakarta, basePrice: '18000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resGypsum, regionId: QS_SEED_IDS.regionJakarta, basePrice: '72000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resHollow, regionId: QS_SEED_IDS.regionJakarta, basePrice: '18000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resCatTembok, regionId: QS_SEED_IDS.regionJakarta, basePrice: '48000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resPlamir, regionId: QS_SEED_IDS.regionJakarta, basePrice: '32000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resBajaRinganC75, regionId: QS_SEED_IDS.regionJakarta, basePrice: '21000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resRengBaja, regionId: QS_SEED_IDS.regionJakarta, basePrice: '11000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resGentengMetal, regionId: QS_SEED_IDS.regionJakarta, basePrice: '95000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resKabelNym, regionId: QS_SEED_IDS.regionJakarta, basePrice: '24000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resPipaPvc, regionId: QS_SEED_IDS.regionJakarta, basePrice: '16500.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resTukangKayu, regionId: QS_SEED_IDS.regionJakarta, basePrice: '200000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resTukangBesi, regionId: QS_SEED_IDS.regionJakarta, basePrice: '200000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resTukangCat, regionId: QS_SEED_IDS.regionJakarta, basePrice: '190000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resTukangListrik, regionId: QS_SEED_IDS.regionJakarta, basePrice: '210000.00', effectiveDate: '2026-01-01' },
      { resourceId: QS_SEED_IDS.resMolen, regionId: QS_SEED_IDS.regionJakarta, basePrice: '350000.00', effectiveDate: '2026-01-01' },
    ])
    .onConflictDoNothing();

  // 4. Master AHSP (AHSP-01 & AHSP-02 Tervalidasi + Starter Multi-Divisi Template)
  await db
    .insert(masterAhsp)
    .values([
      { id: QS_SEED_IDS.ahsp01Dinding, code: 'AHSP-01', name: 'Pemasangan 1 m2 dinding bata merah (1/2 bata) campuran 1 SP : 4 PP', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.ahsp02Plesteran, code: 'AHSP-02', name: 'Pemasangan 1 m2 plesteran 1 SP : 4 PP tebal 15 mm', unit: 'm2', isActive: true },

      // STARTER CATALOG TEMPLATE - SESUAIKAN KOEFISIEN DI MASTER DATA
      { id: QS_SEED_IDS.ahsp03Bowplank, code: 'AHSP-03', name: 'Pengukuran dan pemasangan 1 m1 bouwplank (Template)', unit: 'm1', isActive: true },
      { id: QS_SEED_IDS.ahsp04Galian, code: 'AHSP-04', name: 'Penggalian 1 m3 tanah biasa sedalam 1 m (Template)', unit: 'm3', isActive: true },
      { id: QS_SEED_IDS.ahsp05Pondasi, code: 'AHSP-05', name: 'Pemasangan 1 m3 pondasi batu belah 1 SP : 4 PP (Template)', unit: 'm3', isActive: true },
      { id: QS_SEED_IDS.ahsp06BetonK225, code: 'AHSP-06', name: 'Pembuatan 1 m3 beton mutu f\'c 19.3 MPa / K-225 (Template)', unit: 'm3', isActive: true },
      { id: QS_SEED_IDS.ahsp07Pembesian, code: 'AHSP-07', name: 'Pembesian 10 kg dengan besi polos atau ulir (per 1 kg) (Template)', unit: 'Kg', isActive: true },
      { id: QS_SEED_IDS.ahsp08Bekisting, code: 'AHSP-08', name: 'Pemasangan 1 m2 bekisting struktur kolom/balok (Template)', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.ahsp09Acian, code: 'AHSP-09', name: 'Pemasangan 1 m2 acian semen (Template)', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.ahsp10Keramik60, code: 'AHSP-10', name: 'Pemasangan 1 m2 lantai homogeneous tile 60x60 cm (Template)', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.ahsp11PlafonGypsum, code: 'AHSP-11', name: 'Pemasangan 1 m2 plafon gypsumboard 9 mm + rangka hollow (Template)', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.ahsp12RangkaAtap, code: 'AHSP-12', name: 'Pemasangan 1 m2 rangka atap baja ringan C75 (Template)', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.ahsp13PenutupAtap, code: 'AHSP-13', name: 'Pemasangan 1 m2 penutup atap genteng metal (Template)', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.ahsp14CatDinding, code: 'AHSP-14', name: 'Pengecatan 1 m2 tembok baru interior (1 lapis dasar + 2 lapis penutup) (Template)', unit: 'm2', isActive: true },
      { id: QS_SEED_IDS.ahsp15TitikLampu, code: 'AHSP-15', name: 'Pemasangan 1 titik instalasi listrik lampu / stop kontak (Template)', unit: 'Titik', isActive: true },
      { id: QS_SEED_IDS.ahsp16PipaAir, code: 'AHSP-16', name: 'Pemasangan 1 m1 pipa air bersih PVC tipe AW dia. 3/4" (Template)', unit: 'm1', isActive: true },
    ])
    .onConflictDoNothing();

  // 5. Komposisi Koefisien AHSP
  await db
    .insert(ahspCompositions)
    .values([
      // AHSP-01 (Tervalidasi QS Test 8)
      { ahspId: QS_SEED_IDS.ahsp01Dinding, resourceId: QS_SEED_IDS.resBata, coefficient: '70.0000' },
      { ahspId: QS_SEED_IDS.ahsp01Dinding, resourceId: QS_SEED_IDS.resSemen, coefficient: '11.5000' },
      { ahspId: QS_SEED_IDS.ahsp01Dinding, resourceId: QS_SEED_IDS.resPasir, coefficient: '0.0430' },
      { ahspId: QS_SEED_IDS.ahsp01Dinding, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.3000' },
      { ahspId: QS_SEED_IDS.ahsp01Dinding, resourceId: QS_SEED_IDS.resTukang, coefficient: '0.1000' },
      { ahspId: QS_SEED_IDS.ahsp01Dinding, resourceId: QS_SEED_IDS.resKepala, coefficient: '0.0100' },
      { ahspId: QS_SEED_IDS.ahsp01Dinding, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0150' },

      // AHSP-02 (Tervalidasi QS Test 8)
      { ahspId: QS_SEED_IDS.ahsp02Plesteran, resourceId: QS_SEED_IDS.resSemen, coefficient: '6.2400' },
      { ahspId: QS_SEED_IDS.ahsp02Plesteran, resourceId: QS_SEED_IDS.resPasir, coefficient: '0.0240' },
      { ahspId: QS_SEED_IDS.ahsp02Plesteran, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.3000' },
      { ahspId: QS_SEED_IDS.ahsp02Plesteran, resourceId: QS_SEED_IDS.resTukang, coefficient: '0.1500' },
      { ahspId: QS_SEED_IDS.ahsp02Plesteran, resourceId: QS_SEED_IDS.resKepala, coefficient: '0.0150' },
      { ahspId: QS_SEED_IDS.ahsp02Plesteran, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0150' },

      // AHSP-03 Bowplank (Template)
      { ahspId: QS_SEED_IDS.ahsp03Bowplank, resourceId: QS_SEED_IDS.resKayuBekisting, coefficient: '0.0190' },
      { ahspId: QS_SEED_IDS.ahsp03Bowplank, resourceId: QS_SEED_IDS.resPaku, coefficient: '0.0200' },
      { ahspId: QS_SEED_IDS.ahsp03Bowplank, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.1000' },
      { ahspId: QS_SEED_IDS.ahsp03Bowplank, resourceId: QS_SEED_IDS.resTukangKayu, coefficient: '0.1000' },
      { ahspId: QS_SEED_IDS.ahsp03Bowplank, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0050' },

      // AHSP-04 Galian Tanah (Template)
      { ahspId: QS_SEED_IDS.ahsp04Galian, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.7500' },
      { ahspId: QS_SEED_IDS.ahsp04Galian, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0250' },

      // AHSP-05 Pondasi Batu Kali (Template)
      { ahspId: QS_SEED_IDS.ahsp05Pondasi, resourceId: QS_SEED_IDS.resBatuKali, coefficient: '1.2000' },
      { ahspId: QS_SEED_IDS.ahsp05Pondasi, resourceId: QS_SEED_IDS.resSemen, coefficient: '163.0000' },
      { ahspId: QS_SEED_IDS.ahsp05Pondasi, resourceId: QS_SEED_IDS.resPasir, coefficient: '0.5200' },
      { ahspId: QS_SEED_IDS.ahsp05Pondasi, resourceId: QS_SEED_IDS.resPekerja, coefficient: '1.5000' },
      { ahspId: QS_SEED_IDS.ahsp05Pondasi, resourceId: QS_SEED_IDS.resTukang, coefficient: '0.7500' },
      { ahspId: QS_SEED_IDS.ahsp05Pondasi, resourceId: QS_SEED_IDS.resKepala, coefficient: '0.0750' },
      { ahspId: QS_SEED_IDS.ahsp05Pondasi, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0750' },

      // AHSP-06 Beton K-225 (Template)
      { ahspId: QS_SEED_IDS.ahsp06BetonK225, resourceId: QS_SEED_IDS.resSemen, coefficient: '371.0000' },
      { ahspId: QS_SEED_IDS.ahsp06BetonK225, resourceId: QS_SEED_IDS.resPasirBeton, coefficient: '0.4980' },
      { ahspId: QS_SEED_IDS.ahsp06BetonK225, resourceId: QS_SEED_IDS.resSplit, coefficient: '0.7750' },
      { ahspId: QS_SEED_IDS.ahsp06BetonK225, resourceId: QS_SEED_IDS.resPekerja, coefficient: '1.6500' },
      { ahspId: QS_SEED_IDS.ahsp06BetonK225, resourceId: QS_SEED_IDS.resTukang, coefficient: '0.2750' },
      { ahspId: QS_SEED_IDS.ahsp06BetonK225, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0830' },
      { ahspId: QS_SEED_IDS.ahsp06BetonK225, resourceId: QS_SEED_IDS.resMolen, coefficient: '0.2500' },

      // AHSP-07 Pembesian per 1 kg (Template)
      { ahspId: QS_SEED_IDS.ahsp07Pembesian, resourceId: QS_SEED_IDS.resBesiPolos, coefficient: '1.0500' },
      { ahspId: QS_SEED_IDS.ahsp07Pembesian, resourceId: QS_SEED_IDS.resKawatBeton, coefficient: '0.0150' },
      { ahspId: QS_SEED_IDS.ahsp07Pembesian, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.0070' },
      { ahspId: QS_SEED_IDS.ahsp07Pembesian, resourceId: QS_SEED_IDS.resTukangBesi, coefficient: '0.0070' },
      { ahspId: QS_SEED_IDS.ahsp07Pembesian, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0004' },

      // AHSP-08 Bekisting (Template)
      { ahspId: QS_SEED_IDS.ahsp08Bekisting, resourceId: QS_SEED_IDS.resKayuBekisting, coefficient: '0.0400' },
      { ahspId: QS_SEED_IDS.ahsp08Bekisting, resourceId: QS_SEED_IDS.resPaku, coefficient: '0.4000' },
      { ahspId: QS_SEED_IDS.ahsp08Bekisting, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.6600' },
      { ahspId: QS_SEED_IDS.ahsp08Bekisting, resourceId: QS_SEED_IDS.resTukangKayu, coefficient: '0.3300' },
      { ahspId: QS_SEED_IDS.ahsp08Bekisting, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0330' },

      // AHSP-09 Acian (Template)
      { ahspId: QS_SEED_IDS.ahsp09Acian, resourceId: QS_SEED_IDS.resSemen, coefficient: '3.2500' },
      { ahspId: QS_SEED_IDS.ahsp09Acian, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.2000' },
      { ahspId: QS_SEED_IDS.ahsp09Acian, resourceId: QS_SEED_IDS.resTukang, coefficient: '0.1000' },
      { ahspId: QS_SEED_IDS.ahsp09Acian, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0100' },

      // AHSP-10 Lantai Keramik / Granit 60x60 (Template)
      { ahspId: QS_SEED_IDS.ahsp10Keramik60, resourceId: QS_SEED_IDS.resKeramik60, coefficient: '1.0500' },
      { ahspId: QS_SEED_IDS.ahsp10Keramik60, resourceId: QS_SEED_IDS.resSemen, coefficient: '10.0000' },
      { ahspId: QS_SEED_IDS.ahsp10Keramik60, resourceId: QS_SEED_IDS.resPasir, coefficient: '0.0450' },
      { ahspId: QS_SEED_IDS.ahsp10Keramik60, resourceId: QS_SEED_IDS.resSemenNat, coefficient: '1.5000' },
      { ahspId: QS_SEED_IDS.ahsp10Keramik60, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.7000' },
      { ahspId: QS_SEED_IDS.ahsp10Keramik60, resourceId: QS_SEED_IDS.resTukang, coefficient: '0.3500' },
      { ahspId: QS_SEED_IDS.ahsp10Keramik60, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0350' },

      // AHSP-11 Plafon Gypsum (Template)
      { ahspId: QS_SEED_IDS.ahsp11PlafonGypsum, resourceId: QS_SEED_IDS.resGypsum, coefficient: '0.3640' },
      { ahspId: QS_SEED_IDS.ahsp11PlafonGypsum, resourceId: QS_SEED_IDS.resHollow, coefficient: '4.0000' },
      { ahspId: QS_SEED_IDS.ahsp11PlafonGypsum, resourceId: QS_SEED_IDS.resPaku, coefficient: '0.1100' },
      { ahspId: QS_SEED_IDS.ahsp11PlafonGypsum, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.2000' },
      { ahspId: QS_SEED_IDS.ahsp11PlafonGypsum, resourceId: QS_SEED_IDS.resTukangKayu, coefficient: '0.2000' },
      { ahspId: QS_SEED_IDS.ahsp11PlafonGypsum, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0100' },

      // AHSP-12 Rangka Atap Baja Ringan (Template)
      { ahspId: QS_SEED_IDS.ahsp12RangkaAtap, resourceId: QS_SEED_IDS.resBajaRinganC75, coefficient: '3.2000' },
      { ahspId: QS_SEED_IDS.ahsp12RangkaAtap, resourceId: QS_SEED_IDS.resRengBaja, coefficient: '2.8000' },
      { ahspId: QS_SEED_IDS.ahsp12RangkaAtap, resourceId: QS_SEED_IDS.resPaku, coefficient: '0.2500' },
      { ahspId: QS_SEED_IDS.ahsp12RangkaAtap, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.2000' },
      { ahspId: QS_SEED_IDS.ahsp12RangkaAtap, resourceId: QS_SEED_IDS.resTukangBesi, coefficient: '0.2000' },
      { ahspId: QS_SEED_IDS.ahsp12RangkaAtap, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0100' },

      // AHSP-13 Penutup Atap Genteng Metal (Template)
      { ahspId: QS_SEED_IDS.ahsp13PenutupAtap, resourceId: QS_SEED_IDS.resGentengMetal, coefficient: '1.0500' },
      { ahspId: QS_SEED_IDS.ahsp13PenutupAtap, resourceId: QS_SEED_IDS.resPaku, coefficient: '0.1000' },
      { ahspId: QS_SEED_IDS.ahsp13PenutupAtap, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.2000' },
      { ahspId: QS_SEED_IDS.ahsp13PenutupAtap, resourceId: QS_SEED_IDS.resTukang, coefficient: '0.1000' },
      { ahspId: QS_SEED_IDS.ahsp13PenutupAtap, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0100' },

      // AHSP-14 Pengecatan Dinding Interior (Template)
      { ahspId: QS_SEED_IDS.ahsp14CatDinding, resourceId: QS_SEED_IDS.resPlamir, coefficient: '0.1000' },
      { ahspId: QS_SEED_IDS.ahsp14CatDinding, resourceId: QS_SEED_IDS.resCatTembok, coefficient: '0.2600' },
      { ahspId: QS_SEED_IDS.ahsp14CatDinding, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.0200' },
      { ahspId: QS_SEED_IDS.ahsp14CatDinding, resourceId: QS_SEED_IDS.resTukangCat, coefficient: '0.0630' },
      { ahspId: QS_SEED_IDS.ahsp14CatDinding, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0030' },

      // AHSP-15 Titik Instalasi Listrik (Template)
      { ahspId: QS_SEED_IDS.ahsp15TitikLampu, resourceId: QS_SEED_IDS.resKabelNym, coefficient: '8.0000' },
      { ahspId: QS_SEED_IDS.ahsp15TitikLampu, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.2500' },
      { ahspId: QS_SEED_IDS.ahsp15TitikLampu, resourceId: QS_SEED_IDS.resTukangListrik, coefficient: '0.5000' },
      { ahspId: QS_SEED_IDS.ahsp15TitikLampu, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0250' },

      // AHSP-16 Pipa Air Bersih PVC 3/4" (Template)
      { ahspId: QS_SEED_IDS.ahsp16PipaAir, resourceId: QS_SEED_IDS.resPipaPvc, coefficient: '1.2000' },
      { ahspId: QS_SEED_IDS.ahsp16PipaAir, resourceId: QS_SEED_IDS.resPekerja, coefficient: '0.0360' },
      { ahspId: QS_SEED_IDS.ahsp16PipaAir, resourceId: QS_SEED_IDS.resTukangListrik, coefficient: '0.0600' },
      { ahspId: QS_SEED_IDS.ahsp16PipaAir, resourceId: QS_SEED_IDS.resMandor, coefficient: '0.0020' },
    ])
    .onConflictDoNothing();

  // 6. Proyek Referensi Tervalidasi (mereproduksi Test 8 -> Grand Total Rp 14.744.109,31)
  await db
    .insert(projects)
    .values([
      {
        id: QS_SEED_IDS.projectGolden,
        name: 'RAB Pekerjaan Dinding & Plesteran (SNI 2026)',
        regionId: QS_SEED_IDS.regionJakarta,
        status: 'DRAFT',
        priceDate: '2026-06-15',
        overheadProfitMargin: '10.00',
        taxRatePpn: '11.00',
        clientName: 'Bpk. Hendra Wijaya',
        projectLocation: 'Kebayoran Baru, Jakarta Selatan',
        architectName: 'NexaPlay Architecture Studio',
        buildingAreaM2: '72.00',
      },
    ])
    .onConflictDoNothing();

  // Lengkapi metadata arsitektural bila proyek referensi sudah pernah ter-seed sebelumnya
  await db
    .update(projects)
    .set({
      clientName: 'Bpk. Hendra Wijaya',
      projectLocation: 'Kebayoran Baru, Jakarta Selatan',
      architectName: 'NexaPlay Architecture Studio',
      buildingAreaM2: '72.00',
    })
    .where(eq(projects.id, QS_SEED_IDS.projectGolden));

  await db
    .insert(projectWbs)
    .values([
      {
        id: QS_SEED_IDS.wbsArsitektur,
        projectId: QS_SEED_IDS.projectGolden,
        parentId: null,
        name: 'Pekerjaan Arsitektur',
        sortOrder: 1,
        startWeek: 1,
        durationWeeks: 4,
      },
      {
        id: QS_SEED_IDS.wbsDindingPlesteran,
        projectId: QS_SEED_IDS.projectGolden,
        parentId: QS_SEED_IDS.wbsArsitektur,
        name: 'Pekerjaan Pasangan & Plesteran Dinding',
        sortOrder: 1,
        startWeek: 1,
        durationWeeks: 4,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(projectTakeoffs)
    .values([
      {
        id: QS_SEED_IDS.takeoffDinding,
        wbsId: QS_SEED_IDS.wbsDindingPlesteran,
        ahspId: QS_SEED_IDS.ahsp01Dinding,
        description: 'Pekerjaan Dinding Bata 1/2 Bata (1SP:4PP)',
        sortOrder: 1,
        length: '10.0000',
        width: null,
        height: '3.5000',
        count: 1,
        deductionVolume: '1.8000',
        calculatedVolume: '33.2000',
      },
      {
        id: QS_SEED_IDS.takeoffPlesteran,
        wbsId: QS_SEED_IDS.wbsDindingPlesteran,
        ahspId: QS_SEED_IDS.ahsp02Plesteran,
        description: 'Pekerjaan Plesteran 2 Sisi (1SP:4PP t=15mm)',
        sortOrder: 2,
        length: '10.0000',
        width: null,
        height: '3.5000',
        count: 2,
        deductionVolume: '3.6000',
        calculatedVolume: '66.4000',
      },
    ])
    .onConflictDoNothing();

  console.log('Seed OpenRAB (Katalog Multi-Divisi & QS Tervalidasi 2026) completed idempotently.');
}

main()
  .then(async () => {
    await pool?.end();
  })
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await pool?.end();
    process.exit(1);
  });
