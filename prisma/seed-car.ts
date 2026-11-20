/**
 * 🌱 車輛管理種子資料
 *
 * 建立：
 * 1. 預設車輛（Mazda CX-30）
 * 2. 4 筆預設費用分攤規則
 * 3. 設定 jerry (鴻老爹) 為 PARENT 角色
 *
 * 執行方式：
 *   npx tsx prisma/seed-car.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 開始建立車輛管理種子資料...\n");

  // 1. 找到 jerry (鴻老爹) — ADMIN 使用者
  const jerry = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (!jerry) {
    console.error("❌ 找不到 ADMIN 使用者，請先建立管理員帳號");
    process.exit(1);
  }

  console.log(`✅ 找到 ADMIN 使用者：${jerry.displayName} (${jerry.id})`);

  // 2. 設定 jerry 為 PARENT 角色
  await prisma.user.update({
    where: { id: jerry.id },
    data: { familyRole: "PARENT" },
  });
  console.log(`✅ 已設定 ${jerry.displayName} 為 PARENT 角色`);

  // 3. 設定所有 MEMBER 為 CHILD 角色
  const membersUpdated = await prisma.user.updateMany({
    where: { role: "MEMBER", familyRole: null },
    data: { familyRole: "CHILD" },
  });
  console.log(`✅ 已設定 ${membersUpdated.count} 位成員為 CHILD 角色`);

  // 4. 建立預設車輛（Mazda CX-30）— 先檢查是否已存在
  const existingVehicle = await prisma.vehicle.findFirst({
    where: { brand: "Mazda", model: "CX-30" },
  });

  let vehicle;
  if (existingVehicle) {
    vehicle = existingVehicle;
    console.log(`⏭️  車輛已存在：${vehicle.name} (${vehicle.id})`);
  } else {
    vehicle = await prisma.vehicle.create({
      data: {
        name: "CX-30",
        brand: "Mazda",
        model: "CX-30",
        plateNumber: "待填寫",
        isActive: true,
      },
    });
    console.log(`✅ 已建立車輛：${vehicle.name} (${vehicle.id})`);
  }

  // 5. 建立 4 筆預設費用分攤規則
  const defaultConfigs = [
    {
      item: "一般保養",
      parentRatio: 0,
      calcMethod: "DUAL_TRACK" as const,
      dualTrackBaseRatio: 0.5,
      note: "預設規則：父母 0%，子女雙軌制（50% 均分 + 50% 天數）",
    },
    {
      item: "大保養",
      parentRatio: 0.3,
      calcMethod: "DUAL_TRACK" as const,
      dualTrackBaseRatio: 0.5,
      note: "預設規則：父母 30%，子女雙軌制（50% 均分 + 50% 天數）",
    },
    {
      item: "牌照稅與燃料稅",
      parentRatio: 0.3,
      calcMethod: "EVEN_SPLIT" as const,
      dualTrackBaseRatio: 0,
      note: "預設規則：父母 30%，子女均分",
    },
    {
      item: "強制險與超額險",
      parentRatio: 0.3,
      calcMethod: "EVEN_SPLIT" as const,
      dualTrackBaseRatio: 0,
      note: "預設規則：父母 30%，子女均分",
    },
  ];

  for (const config of defaultConfigs) {
    const existing = await prisma.carCostConfig.findFirst({
      where: {
        vehicleId: vehicle.id,
        item: config.item,
        isActive: true,
      },
    });

    if (existing) {
      console.log(`⏭️  規則已存在：${config.item}`);
      continue;
    }

    await prisma.carCostConfig.create({
      data: {
        vehicleId: vehicle.id,
        item: config.item,
        parentRatio: config.parentRatio,
        calcMethod: config.calcMethod,
        dualTrackBaseRatio: config.dualTrackBaseRatio,
        effectiveFrom: new Date("2024-01-01"),
        effectiveMode: "RETROACTIVE",
        isActive: true,
        note: config.note,
        createdBy: jerry.id,
      },
    });
    console.log(`✅ 已建立規則：${config.item}（父母 ${config.parentRatio * 100}%，${config.calcMethod === "DUAL_TRACK" ? "雙軌制" : "均分制"}）`);
  }

  console.log("\n🎉 車輛管理種子資料建立完成！");
  console.log(`\n📋 摘要：`);
  console.log(`   車輛：${vehicle.name} (${vehicle.brand} ${vehicle.model})`);
  console.log(`   費用規則：4 筆`);
  console.log(`   ADMIN：${jerry.displayName} → PARENT`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
