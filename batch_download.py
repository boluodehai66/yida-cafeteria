import os
import requests
from openai import OpenAI
from app import app, db, MenuItem

# 🌟 配置智谱 AI API
ZHIPU_API_KEY = "579e9802d2304881a96ed288488c809b.uq6edTegmxXzpVtm"

image_client = OpenAI(
    api_key=ZHIPU_API_KEY,
    base_url="https://open.bigmodel.cn/api/paas/v4/"
)


def batch_generate_and_download():
    with app.app_context():
        image_dir = os.path.join(app.root_path, 'static', 'images')
        os.makedirs(image_dir, exist_ok=True)

        items = MenuItem.query.all()
        print(f"🍽️ 准备就绪！共发现 {len(items)} 条菜单数据，开始智能进货...")
        print("-" * 50)

        # 记录这次运行中已经画过哪些菜了，避免同一次运行中重复画
        processed_dishes = set()

        for item in items:
            dish_name = item.name
            local_filename = f"{dish_name}.jpg"
            local_filepath = os.path.join(image_dir, local_filename)
            db_image_path = f"/static/images/{local_filename}"

            # =======================================================
            # 🌟 核心省钱逻辑：只要本地有图，或者刚刚已经画过，就绝对不花钱！
            # =======================================================
            if os.path.exists(local_filepath) or dish_name in processed_dishes:
                if item.image != db_image_path:
                    # 如果数据库里的图还没关联上，顺手给它关联一下
                    item.image = db_image_path
                    db.session.commit()
                    print(f"🔗 【{dish_name}】照片已存在，直接关联数据库，省下一次额度！")
                else:
                    print(f"⏩ 【{dish_name}】已完美处理，跳过。")

                processed_dishes.add(dish_name)  # 标记为已有
                continue

            print(f"🎨 正在召唤 智谱CogView 为【{dish_name}】作画...")
            chinese_prompt = f"一张专业的美食摄影照片，中国菜【{dish_name}】，刚出锅冒着热气，色泽诱人，餐厅级打光，高清微距特写。"

            try:
                response = image_client.images.generate(
                    model="cogview-3-plus",
                    prompt=chinese_prompt,
                    size="1024x1024"
                )
                image_url = response.data[0].url

                print(f"⬇️ 正在将【{dish_name}】下载到本地硬盘...")
                img_data = requests.get(image_url).content
                with open(local_filepath, 'wb') as handler:
                    handler.write(img_data)

                item.image = db_image_path
                db.session.commit()
                processed_dishes.add(dish_name)  # 画完立刻加入“白名单”
                print(f"✅ 【{dish_name}】新照片入库成功！")

            except Exception as e:
                print(f"❌ 处理【{dish_name}】时遇到问题: {str(e)}")

            print("-" * 50)

        print("🎉 智能进货全部完成！完美避开所有重复菜品，一分钱都没多花！")


if __name__ == '__main__':
    batch_generate_and_download()