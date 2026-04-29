import pandas as pd
import re
import os
import urllib.parse
from app import app, db, MenuItem


def guess_category(name):
    """超级增强版：根据菜名关键词自动精准推断分类"""
    # 补充了 馒头、包、饼、盒子 等关键词
    staple_keywords = ['饭',   '馍', '窝头', '饺',  '卷', '饼', '馒头']
    snack_keywords = ['油条', '糕', '麻团', '菜角', '盒子', '蛋挞', '包']
    soup_keywords = ['汤', '羹', '豆浆', '奶茶','粥']
    meat_keywords = ['肉', '鸡', '鸭', '鱼', '牛', '羊', '虾', '排骨', '蹄', '胗', '里脊', '肥牛']
    veg_keywords = ['白菜', '生菜', '豆腐', '瓜', '豆角', '藕', '茄', '菇', '菠菜', '西兰花', '土豆', '豇豆', '面筋',
                    '莲白', '豆芽', '菜心']

    # 严格按照前端的5个分类进行匹配
    for kw in staple_keywords:
        if kw in name: return "主食"
    for kw in snack_keywords:
        if kw in name: return "小吃"
    for kw in soup_keywords:
        if kw in name: return "汤羹"
    for kw in meat_keywords:
        if kw in name: return "荤菜"
    for kw in veg_keywords:
        if kw in name: return "素菜"

    return "特色菜品"  # 如果实在认不出，就放这里


def generate_image_url(name):
    safe_name = urllib.parse.quote(name[:4])
    return f"https://ui-avatars.com/api/?name={safe_name}&background=random&color=fff&size=250&font-size=0.3&length=4"


def parse_dish_text(content_str):
    name = content_str.split('\n')[0].strip()
    price_match = re.search(r'￥(\d+\.?\d*)', content_str)
    calories = re.search(r'热量\s*(\d+)', content_str)
    carbs = re.search(r'碳水\s*(\d+\.?\d*)', content_str)
    protein = re.search(r'蛋白\s*(\d+\.?\d*)', content_str)
    fat = re.search(r'脂肪\s*(\d+\.?\d*)', content_str)

    dish_category = guess_category(name)
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
    print(f"⏳ 准备从 [{file_name}] 导入所有菜单数据...")
    basedir = os.path.abspath(os.path.dirname(__file__))
    csv_path = os.path.join(basedir, file_name)

    if not os.path.exists(csv_path):
        print(f"❌ 找不到文件: {csv_path}，请确保该文件与脚本在同一目录！")
        return

    with app.app_context():
        db.create_all()
        MenuItem.query.filter_by(week=week_num).delete()
        imported_count = 0

        # 优先尝试 utf-8，如果报错就自动切换为 gbk 读取
        try:
            df = pd.read_csv(csv_path, encoding='utf-8')
        except UnicodeDecodeError:
            df = pd.read_csv(csv_path, encoding='gbk')

        for col_name in df.columns:
            # 强制纠正周天为周日，防止前端因为名字不对匹配不上
            actual_day = "周日" if col_name == "周天" else col_name

            for content in df[col_name].dropna():
                if str(content).strip() == "" or "Unnamed" in str(content):
                    continue

                dish_info = parse_dish_text(str(content))
                new_item = MenuItem(week=week_num, day=actual_day, **dish_info)
                db.session.add(new_item)
                imported_count += 1

                # 新增：打印出关键菜品，让你确认脚本到底读没读到！
                if dish_info['category'] in ['主食', '小吃', '汤羹']:
                    print(f"✅ 成功读取 -> {dish_info['name']} (归类为: {dish_info['category']})")

        db.session.commit()
        print(f"\n🎉 完美！数据更新完成！共向数据库写入 {imported_count} 道菜品信息。")


if __name__ == '__main__':
    import_csv_to_db(file_name='menu.csv', week_num=1)