import pandas as pd
import re
import os
import time
import urllib.parse
from openai import OpenAI
from app import app, db, MenuItem

# ================= 1. 初始化硅基流动 API 客户端 =================
client = OpenAI(
    api_key="sk-cfxtslelijzmkfsdvnoqggdhmexmczpltavhbszqhmbivffr",
    base_url="https://api.siliconflow.cn/v1"
)


def ai_guess_category(dish_name):
    """使用 Qwen2.5 语义大模型精准识别菜品分类"""
    system_prompt = """你是一个专业的餐饮分类助手。请根据菜名判断其分类。
    你必须且只能从以下五个选项中选择一个返回：[主食, 荤菜, 素菜, 小吃, 汤羹]。
    请直接返回分类名称，不要包含任何标点或额外解释。"""

    try:
        response = client.chat.completions.create(
            model="Qwen/Qwen2.5-7B-Instruct",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"菜名：{dish_name}"}
            ],
            temperature=0.1
        )
        category = response.choices[0].message.content.strip()
        # 二次安全校验，确保一定是这五类之一
        valid_cats = ["主食", "荤菜", "素菜", "小吃", "汤羹"]
        return category if category in valid_cats else "其他"
    except Exception as e:
        print(f"⚠️ 云端 AI 分类异常({dish_name}): {e}")
        return "其他"


def generate_image_url(name):
    # 生成好看的文字占位图
    safe_name = urllib.parse.quote(name[:4])
    return f"https://ui-avatars.com/api/?name={safe_name}&background=random&color=fff&size=250&font-size=0.3&length=4"


def parse_dish_text(content_str):
    name = content_str.split('\n')[0].strip()

    # 提取所有数值
    price_match = re.search(r'￥(\d+\.?\d*)', content_str)
    calories = re.search(r'热量\s*(\d+)', content_str)
    carbs = re.search(r'碳水\s*(\d+\.?\d*)', content_str)
    protein = re.search(r'蛋白\s*(\d+\.?\d*)', content_str)
    fat = re.search(r'脂肪\s*(\d+\.?\d*)', content_str)

    # ================= 核心：调用 AI 进行分类 =================
    print(f"🧠 AI 正在识别分类 -> {name}...")
    dish_category = ai_guess_category(name)
    time.sleep(0.5)  # 稍微停顿半秒，防止 API 请求过快被硅基流动拦截（限流保护）

    return {
        "name": name,
        "category": dish_category,
        "price": float(price_match.group(1)) if price_match else 5.0,
        "calories": int(calories.group(1)) if calories else 0,
        "carbs": float(carbs.group(1)) if carbs else 0.0,
        "protein": float(protein.group(1)) if protein else 0.0,
        "fat": float(fat.group(1)) if fat else 0.0,
        "image": generate_image_url(name)
    }


def import_csv_to_db(file_name, week_num=1):
    print(f"⏳ 准备从 [{file_name}] 导入菜单数据，将全程使用 AI 辅助分类...")
    basedir = os.path.abspath(os.path.dirname(__file__))
    csv_path = os.path.join(basedir, file_name)

    if not os.path.exists(csv_path):
        print(f"❌ 找不到文件: {csv_path}")
        return

    with app.app_context():
        # 清空旧表，重新建表
        db.drop_all()
        db.create_all()
        imported_count = 0

        try:
            df = pd.read_csv(csv_path, encoding='utf-8-sig')
        except UnicodeDecodeError:
            df = pd.read_csv(csv_path, encoding='gbk')

        for col_name in df.columns:
            actual_day = "周日" if col_name == "周天" else col_name
            for content in df[col_name].dropna():
                if str(content).strip() == "" or "Unnamed" in str(content):
                    continue

                dish_info = parse_dish_text(str(content))
                new_item = MenuItem(week=week_num, day=actual_day, **dish_info)
                db.session.add(new_item)
                imported_count += 1
                print(f"✅ 成功录入: {dish_info['name']} -> [被 AI 归为: {dish_info['category']}]")

        db.session.commit()
        print(f"🎉 完美！共向数据库写入 {imported_count} 道带有营养成分和 AI 分类的菜品。")


if __name__ == '__main__':
    # 确保你的文件夹里有真正的 menu.csv（逗号分隔的纯文本文件）
    import_csv_to_db(file_name='menu.csv', week_num=1)