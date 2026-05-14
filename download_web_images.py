import os
from icrawler.builtin import BingImageCrawler
from app import app, db, MenuItem


def download_real_images():
    with app.app_context():
        # 1. 确定图片存放路径
        image_dir = os.path.join(app.root_path, 'static', 'images')
        os.makedirs(image_dir, exist_ok=True)

        # 2. 从数据库获取所有菜名
        items = MenuItem.query.all()
        # 去重，同样的菜名只搜一次
        dish_names = list(set([item.name for item in items]))

        print(f"🚀 开始从网络搜集 {len(dish_names)} 道菜品的真实照片...")

        for name in dish_names:
            local_filename = f"{name}.jpg"
            local_filepath = os.path.join(image_dir, local_filename)
            db_image_path = f"/static/images/{local_filename}"

            # 如果本地已经有图了，就跳过
            if os.path.exists(local_filepath):
                print(f"⏩ 【{name}】本地已有图片，跳过。")
                continue

            print(f"🔍 正在搜索并下载：{name} ...")

            # 使用 Bing 爬虫，因为它对中文搜索支持很好且不需要 API Key
            # 我们只下载 1 张最相关的图
            google_crawler = BingImageCrawler(storage={'root_dir': image_dir})

            # 这里的 rename_filename 是关键，确保下载下来就是菜名
            try:
                google_crawler.crawl(keyword=name, max_num=1)

                # icrawler 默认下载的文件名是 000001.jpg，我们需要给它重命名
                old_file = os.path.join(image_dir, '000001.jpg')
                if os.path.exists(old_file):
                    # 如果已经存在同名文件，先删除旧的防止重命名失败
                    if os.path.exists(local_filepath):
                        os.remove(local_filepath)
                    os.rename(old_file, local_filepath)
                    print(f"✅ 【{name}】下载并重命名成功！")
                else:
                    print(f"⚠️ 【{name}】搜索到了但下载失败。")

            except Exception as e:
                print(f"❌ 下载【{name}】时出错: {e}")

        # 3. 批量更新数据库路径（确保文字和图片关联上）
        print("\n🔄 正在同步数据库路径...")
        for item in MenuItem.query.all():
            item.image = f"/static/images/{item.name}.jpg"
        db.session.commit()

        print("🎉 任务完成！所有真实菜品照片已入库。")


if __name__ == '__main__':
    download_real_images()