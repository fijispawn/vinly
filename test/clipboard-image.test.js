import test from 'node:test';
import assert from 'node:assert/strict';
import {imageFromCopiedPage} from '../clipboard-image.js';

const page='https://simplewine.ru/catalog/product/loco_cimbali_kokur_2025_075_161486/';

test('картинка нужного вина берётся из HTML буфера, а не из похожих товаров',()=>{
 const html='<img alt="Вино Loco Cimbali Orange" src="/upload/iblock/orange.png"><img alt="Вино Loco Cimbali Kokur, 2025" src="/upload/iblock/kokur.png">';
 assert.equal(imageFromCopiedPage('',html,page),'https://simplewine.ru/upload/iblock/kokur.png');
});

test('картинка берётся из данных товара, если они есть в скопированном HTML',()=>{
 const data={props:{pageProps:{initialState:{product:{currentProductData:{media:{images:['/upload/iblock/main.png']}}}}}}};
 assert.equal(imageFromCopiedPage('',`<script id="__NEXT_DATA__">${JSON.stringify(data)}</script>`,page),'https://simplewine.ru/upload/iblock/main.png');
});

test('посторонний адрес картинки не принимается',()=>{
 assert.equal(imageFromCopiedPage('',`<img alt="Вино Loco Cimbali Kokur" src="https://example.com/wine.png">`,page),'');
});
