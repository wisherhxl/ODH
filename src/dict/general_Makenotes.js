/* global api */
class general_Makenotes {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
        this.makenotes_lable = '';
    }

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('CN') != -1) { this.makenotes_lable = '输入笔记(需在后台配置输出选项以保存)'; return '笔记摘录脚本'; }
        if (locale.indexOf('TW') != -1) { this.makenotes_lable = '輸入筆記(需在後臺配置輸出選項以保存)'; return '筆記摘錄腳本'; }
        this.makenotes_lable = 'add notes here.(to save, need setup export option in backend)';
        return 'Make Notes';
    }


    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        console.log("yes");
        this.word = word;

        var pattern = new RegExp("[\u4E00-\u9FA5]+");
        if (pattern.test(this.word)) {
            let zdicResult = await this.findZdic(word);
            if( zdicResult.length > 0 ){
                return zdicResult;
            } 
        } else {
            let promises = [this.findCambridge(word), this.findYoudao(word)];
            if(promises.length > 0) {
                let results = await Promise.all(promises);
                return [].concat(...results).filter(x => x);
            }
        }

        // let deflection = api.deinflect(word);
        let note_result = await Promise.all([this.makeNotes(word)]);
        return [].concat(...note_result).filter(x => x);
    }

    async makeNotes(word) {
        if (!word) return [];
        let notes = [];
        // let css = '<style>.odh-expression {font-size: 1em!important;font-weight: normal!important;}</style>';
        let css = this.renderCSS();
        notes.push({ css, definitions: [this.word] });
        return notes;
    }

    removeTags(elem, name) {
        let tags = elem.querySelectorAll(name);
        tags.forEach(x => {
            x.outerHTML = '';
        });
    }

    async findZdic(word) {
        let notes = [];
        if (!word) return notes; // return empty notes

        function T(node) {
            if (!node)
                return '';
            else
                return node.innerText.trim();
        }
        
        let doc = '';
        try {
            let url = `https://www.zdic.net/hans/${encodeURIComponent(word)}`;
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            return [];
        }

        let jbjs = doc.querySelector('.jbjs') || ''; // basic explaination
        //let xxjsContent = doc.querySelector('.res_c_center') || '';
        if (jbjs) {
            this.removeTags(jbjs,'.zib-title'); 
            this.removeTags(jbjs,'.h2_entry'); 
            this.removeTags(jbjs,'.am-default.contentslot');
            return jbjs.innerHTML;
        } else {
            return [];
        }
    }

    async findCambridge(word) {
        let notes = [];
        if (!word) return notes; // return empty notes

        function T(node) {
            if (!node)
                return '';
            else
                return node.innerText.trim();
        }

        let base = 'https://dictionary.cambridge.org/search/english-chinese-simplified/direct/?q=';
        let url = base + encodeURIComponent(word);
        let doc = '';
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            return [];
        }

        let entries = doc.querySelectorAll('.pr .entry-body__el') || [];
        for (const entry of entries) {
            let definitions = [];
            let audios = [];

            let expression = T(entry.querySelector('.headword'));
            let reading = '';
            let readings = entry.querySelectorAll('.pron .ipa');
            if (readings) {
                let reading_uk = T(readings[0]);
                let reading_us = T(readings[1]);
                reading = (reading_uk || reading_us) ? `UK[${reading_uk}] US[${reading_us}] ` : '';
            }
            let pos = T(entry.querySelector('.posgram'));
            pos = pos ? `<span class='pos'>${pos}</span>` : '';
            audios[0] = entry.querySelector(".uk.dpron-i source");
            audios[0] = audios[0] ? 'https://dictionary.cambridge.org' + audios[0].getAttribute('src') : '';
            //audios[0] = audios[0].replace('https', 'http');
            audios[1] = entry.querySelector(".us.dpron-i source");
            audios[1] = audios[1] ? 'https://dictionary.cambridge.org' + audios[1].getAttribute('src') : '';
            //audios[1] = audios[1].replace('https', 'http');

            let sensbodys = entry.querySelectorAll('.sense-body') || [];
            for (const sensbody of sensbodys) {
                let sensblocks = sensbody.childNodes || [];
                for (const sensblock of sensblocks) {
                    let phrasehead = '';
                    let defblocks = [];
                    if (sensblock.classList && sensblock.classList.contains('phrase-block')) {
                        phrasehead = T(sensblock.querySelector('.phrase-title'));
                        phrasehead = phrasehead ? `<div class="phrasehead">${phrasehead}</div>` : '';
                        defblocks = sensblock.querySelectorAll('.def-block') || [];
                    }
                    if (sensblock.classList && sensblock.classList.contains('def-block')) {
                        defblocks = [sensblock];
                    }
                    if (defblocks.length <= 0) continue;

                    // make definition segement
                    for (const defblock of defblocks) {
                        let eng_tran = T(defblock.querySelector('.ddef_h .def'));
                        let chn_tran = T(defblock.querySelector('.def-body .trans'));
                        if (!eng_tran) continue;
                        let definition = '';
                        eng_tran = `<span class='eng_tran'>${eng_tran.replace(RegExp(expression, 'gi'),`<b>${expression}</b>`)}</span>`;
                        chn_tran = `<span class='chn_tran'>${chn_tran}</span>`;
                        let tran = `<span class='tran'>${eng_tran}${chn_tran}</span>`;
                        definition += phrasehead ? `${phrasehead}${tran}` : `${pos}${tran}`;

                        // make exmaple segement
                        let examps = defblock.querySelectorAll('.def-body .examp') || [];
                        if (examps.length > 0 && this.maxexample > 0) {
                            definition += '<ul class="sents">';
                            for (const [index, examp] of examps.entries()) {
                                if (index > this.maxexample - 1) break; // to control only 2 example sentence.
                                let eng_examp = T(examp.querySelector('.eg'));
                                let chn_examp = T(examp.querySelector('.trans'));
                                definition += `<li class='sent'><span class='eng_sent'>${eng_examp.replace(RegExp(expression, 'gi'),`<b>${expression}</b>`)}</span><span class='chn_sent'>${chn_examp}</span></li>`;
                            }
                            definition += '</ul>';
                        }
                        definition && definitions.push(definition);
                    }
                }
            }
            let css = this.renderCSS();
            notes.push({
                css,
                expression,
                reading,
                definitions,
                audios
            });
        }
        return notes;
    }

    async findYoudao(word) {
        if (!word) return [];

        let base = 'https://dict.youdao.com/w/';
        let url = base + encodeURIComponent(word);
        let doc = '';
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
            let youdao = getYoudao(doc); //Combine Youdao Concise English-Chinese Dictionary to the end.
            let ydtrans = getYDTrans(doc); //Combine Youdao Translation (if any) to the end.
            return [].concat(youdao, ydtrans);
        } catch (err) {
            return [];
        }

        function getYoudao(doc) {
            let notes = [];

            //get Youdao EC data: check data availability
            let defNodes = doc.querySelectorAll('#phrsListTab .trans-container ul li');
            if (!defNodes || !defNodes.length) return notes;

            //get headword and phonetic
            let expression = T(doc.querySelector('#phrsListTab .wordbook-js .keyword')); //headword
            let reading = '';
            let readings = doc.querySelectorAll('#phrsListTab .wordbook-js .pronounce');
            if (readings) {
                let reading_uk = T(readings[0]);
                let reading_us = T(readings[1]);
                reading = (reading_uk || reading_us) ? `${reading_uk} ${reading_us}` : '';
            }

            let audios = [];
            audios[0] = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=1`;
            audios[1] = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(expression)}&type=2`;

            let definition = '<ul class="ec">';
            for (const defNode of defNodes){
                let pos = '';
                let def = T(defNode);
                let match = /(^.+?\.)\s/gi.exec(def);
                if (match && match.length > 1){
                    pos = match[1];
                    def = def.replace(pos, '');
                }
                pos = pos ? `<span class="pos simple">${pos}</span>`:'';
                definition += `<li class="ec">${pos}<span class="ec_chn">${def}</span></li>`;
            }
            definition += '</ul>';
            let css = `
                <style>
                    span.pos  {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#0d47a1; border-radius:3px;}
                    span.simple {background-color: #999!important}
                    ul.ec, li.ec {margin:0; padding:0;}
                </style>`;
            notes.push({
                css,
                expression,
                reading,
                definitions: [definition],
                audios
            });
            return notes;
        }

        function getYDTrans(doc) {
            let notes = [];

            //get Youdao EC data: check data availability
            let transNode = doc.querySelectorAll('#ydTrans .trans-container p')[1];
            if (!transNode) return notes;

            let definition = `${T(transNode)}`;
            let css = `
                <style>
                    .odh-expression {
                        font-size: 1em!important;
                        font-weight: normal!important;
                    }
                </style>`;
            notes.push({
                css,
                definitions: [definition],
            });
            return notes;
        }

        function T(node) {
            if (!node)
                return '';
            else
                return node.innerText.trim();
        }
    }

    renderCSS() {
        let css = `
            <style>
                div.phrasehead{margin: 2px 0;font-weight: bold;}
                span.star {color: #FFBB00;}
                span.pos  {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#0d47a1; border-radius:3px;}
                span.tran {margin:0; padding:0;}
                span.eng_tran {margin-right:3px; padding:0;}
                span.chn_tran {color:#0d47a1;}
                ul.sents {font-size:0.8em; list-style:square inside; margin:3px 0;padding:5px;background:rgba(13,71,161,0.1); border-radius:5px;}
                li.sent  {margin:0; padding:0;}
                span.eng_sent {margin-right:5px;}
                span.chn_sent {color:#0d47a1;}
            </style>`;
        return css;
    }
}