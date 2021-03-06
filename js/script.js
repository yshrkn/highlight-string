'use strict';

var RegexHighlight = RegexHighlight || {};

RegexHighlight = (() => {
  let blockElementNodes; /* 各ノードにあるブロック要素を格納。添え字が小さいほど上階層のノード */
  let textCount = 0; /* 文字列をハイライトする際に使用 */
  let regexResult; /* 正規表現の結果を格納する */

  let highlightCompleted = false; /* ハイライト処理が完了した場合true */
  let highlightError = false; /* ハイライトできなかった場合true */

  let stopSearchingBlock = false; /* 子要素の探索が終わった場合のフラグ */
  let remainingCount = 0; /* ハイライト中のノードがまだあるとき、あと何文字ハイライトすべきかを保持 */
  let isRemaining = false; /* ハイライト中のノードがまだあるときにtrue */
  let nextHighlightElement = null; /* ハイライト中のノードがまだあるとき、次にハイライトすべきエレメントノードを格納する */
  let shouldCheckNextCondition = false; /* 次のチェックに移るべきか判定するフラグ */

  /* 定数 */
  const constantsMap = {
    prefix: 'rh-',
    targetKeyName: 'regex',
    recommendKeyName: 'recommendation'
  };

  /* 設定系 */
  const configMap = {
    highlight: {
      color: '#ff0',
      className: `${constantsMap.prefix}highlight`,
    },
  };

  /* チェックする文言リスト */
  const checkList = [
    {
      'regex': 'クリスマス',
      'recommendation': '「クリスマス」にハイライト'
    },
    {
      'regex': 'Qiita',
      'recommendation': '「Qiita」にハイライト'
    },
    {
      'regex': 'Advent Calendar',
      'recommendation': '「Advent Calendar」にハイライト'
    },
  ];
  
  /**
   * 
   */
  function start() {
    addCSS();

    const start = performance.now();

    /* 文言チェック処理 */
    document.body.childNodes.forEach(node => {
      const isElement = isElementNode(node);
      if (!isElement) { return; }

      if (isElement) {
        /* 初期化 */
        stopSearchingBlock = false;
        blockElementNodes = [];

        setBlockElementNode(node);

        if (!blockElementNodes.length) { return; }

        do {
          let blockNElementNode = blockElementNodes.pop();
          checkWords(blockNElementNode);

          if (!blockElementNodes.length) { break; }
        } while (blockElementNodes.length);
      }

    });

    const end = performance.now();

    alert(`チェックが完了しました。\n検索時間：${(end - start) / 1000}秒`);
  }

  /**
   * ハイライト用CSSの追記
   */
  function addCSS() {
    const styleElement = document.createElement('style');
    styleElement.type = 'text/css';
    styleElement.innerText = `.${configMap.highlight.className} { display:inline !important; background: ${configMap.highlight.color} !important; }`;
    document.head.appendChild(styleElement);
  }

  /**
   * 引数で渡されたエレメントノードが除外対象であればtrueを返却する
   * ●除外対象
   *     ・タグ名による除外（header, footer, noscript, script, br, style, link）
   *     ※ body直下のnodeでない場合、上位ノードからのチェック結果によるハイライトは現状避けられない
   * 
   * @param node {HTMLElement}
   * @returns boolean
   */
  function isIgnoredElementNode(node) {
    /* 除外対象タグであればtrueを返却して終了 */
    return node.tagName === 'SCRIPT' || 
           node.tagName === 'NOSCRIPT' || 
           node.tagName === 'BR' || 
           node.tagName === 'STYLE' || 
           node.tagName === 'LINK';
  }

  /**
   * 
   * @param {HTMLElement} node 
   */
  function hasChild(node) {
    return node.childNodes.length !== 0;
  }

  /**
   * ブロック要素のエレメントノードを探索し、見つかった場合は変数 blockElementNodesにセットする
   * @param {HTMLElement} node 
   */
  function setBlockElementNode(node) {

    if (!validateNodeToSetBlockElementNodes(node)) { return; }

    try {
      /* 隣り合うすべてのエレメントに対して、ブロック要素が見つかれば再帰処理 */
      let next = node;
      do {
        /* blockElementNodes配列へ格納 */
        blockElementNodes.push(next);
        
        for (let i = 0; i < next.children.length; i++) {
          if (stopSearchingBlock) { break; }

          const child = next.children[i];
          setBlockElementNode(child);
        }

        if (stopSearchingBlock) { break; }

        next = next.nextElementSibling;

        if (next === null) {
          stopSearchingBlock = true;
          break;
        }

      } while (true);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * 
   * @param {Node} node 
   * @returns {Boolean}
   */
  function isElementNode(node) {
    return node.nodeType === Node.ELEMENT_NODE;
  }

  /**
   * 
   * @param {*} node 
   * @returns {Boolean}
   */
  function isTextNode(node) {
    return node.nodeType === Node.TEXT_NODE;
  }


  /**
   * 変数 blockElementNodesへ格納するべきエレメントノードであればtrueを返却する
   * 
   * @param {HTMLElement} node 
   * @returns {Boolean}
   */
  function validateNodeToSetBlockElementNodes(node) {
    /* 検証順序はisElementNodeメソッドを一番最初に呼ぶこと */
    return isElementNode(node) && !(isIgnoredElementNode(node)) && !isInlineElementNode(node) && hasChild(node);
  }

  /**
   * 引数のエレメントノードがインライン要素であればtrueを返却
   * @param elm {HTMLElement}  
   * @returns {Boolean}  
   */
  function isInlineElementNode(elm) {
    const style = window.getComputedStyle(elm);
    
    return style.display === 'inline' && 
　         style.display === 'inline-block' && 
           style.display === 'inline-flex';
  }

  /**
   * チェックリストに当てはまる文字列が存在するか
   * チェックに使用する親要素は blockElementNodes.length - 1 の要素(直近の親)
   */
  function checkWords(closestBlockNode) {

    if (getPlainString(closestBlockNode.textContent) === '') { return; }

    /* チェックリストを走査する */
    checkList.forEach((obj, i) => {

      /* チェックリストのマッチ条件が空の場合はなにもしない */
      const keyIsEmpty = obj[constantsMap.targetKeyName] === '' || obj[constantsMap.targetKeyName] === undefined;
      if (keyIsEmpty) { return; }

      const regex = new RegExp(obj[constantsMap.targetKeyName], 'g');

      let plainText = closestBlockNode.textContent;
      while ((regexResult = regex.exec(plainText)) !== null) {
        /* 結果オブジェクトにtitle属性に表示する文字列追加 */
        regexResult.recommend = obj[constantsMap.recommendKeyName];

        resetHighlightVariables();

        /* テキストノード探索 */
        findTextNode(closestBlockNode);
      }
    });
  }

  /**
   * ハイライトに関わる変数の初期化
   */
  function resetHighlightVariables() {
    isRemaining = false;
    remainingCount = 0;
    highlightCompleted = false;
    highlightError = false;
    textCount = 0;
    shouldCheckNextCondition = false;
  }

  /**
   * ハイライト処理
   */
  function highlightText(textNode) {
    const textNodeLen = textNode.nodeValue.length;

    /* ハイライトタグ作成 */
    const span = document.createElement('span');
    span.className = 'rh-highlight';
    span.setAttribute('title', regexResult.recommend);

    /* ハイライトタグで囲む開始/終了地点を設定 */
    let startIndex;
    let endIndex;
    if (isRemaining) {
      startIndex = 0;
      endIndex = remainingCount;
    } else {
      startIndex = Math.abs(regexResult.index - textCount);
      endIndex = startIndex + regexResult[0].length;
    }

    /**
     * テキストノードのlengthがハイライト対象文字数より少ない場合の処理
     **/ 
    const gap = Math.abs(startIndex - endIndex);
    const idealTextNodeLen = startIndex + gap; /* ハイライトに最低限必要なテキストノードの長さ */
    const isShorter = textNodeLen < idealTextNodeLen;
    if (isShorter) {
      isRemaining = true;
      remainingCount = Math.abs(textNodeLen - idealTextNodeLen);

      /* ハイライトできる反映のみハイライトする */
      endIndex = textNodeLen;
    }

    try {
      /* Rangeオブジェク作成 */
      const range = document.createRange();
      range.setStart(textNode, startIndex);
      range.setEnd(textNode, endIndex);
      range.surroundContents(span);

      /* 以降ハイライト正常終了時 */    
      if (isRemaining) {

        if (!isShorter) {
          remainingCount -= textNodeLen;

          /* ハイライト途中のノードをすべてハイライトし終えたとき */
          if (remainingCount < 0) {
            isRemaining = false;
            highlightCompleted = true;
            shouldCheckNextCondition = true;

            return;
          }
        }

        nextHighlightElement = span.nextElementSibling;
      } else {
        shouldCheckNextCondition = true;
        highlightCompleted = true;
      }
    } catch (e) {
      console.error(e);
      isRemaining = false;
      highlightError = true;
    }  
  }

  /**
   * 引数のテキストノードが改行や空白を取り除いたときに空文字と等しい場合trueを返却する
   * @param {string} str
   */
  function getPlainString(str) {
    try {
      return str.replace(/^\s+|\s+$/g, '').trim();
    } catch (e) {
      console.error(e);
    }    
  }

  /**
   * テキストノードを探索する
   * @param elementNode {HTMLElement}
   */
  function findTextNode(elementNode) {
    try {
      Array.from(elementNode.childNodes).some(node => {

        if (node.nodeValue === '') { return false; }
  
        if (shouldCheckNextCondition) { return true; }
  
        /* 要素ノードかテキストノードかを判定 */
        if (isElementNode(node)) {  
          if (node.childNodes.length) {
            findTextNode(node);
          }
        } else if (isTextNode(node) && node.nodeValue !== '') {
          checkHighlight(node);
  
          if (shouldCheckNextCondition) { return true; }
        }
  
        /* ハイライトが終わっていないノードがある場合 */
        if (isRemaining && nextHighlightElement) {
          if (nextHighlightElement.childNodes.length) {
            findTextNode(nextHighlightElement);
          }
        }
  
        if (shouldCheckNextCondition) { return true; }
      });
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * ハイライトするべきテキストノードであれば、ハイライト処理へ移行する
   * @param {Node} TEXT_NODE
   */
  function checkHighlight(node) {
    if (isRemaining) {
      highlightText(node);
      return;
    }

    const shouldHighlight = regexResult.index < textCount + node.nodeValue.length;
    if (shouldHighlight) {
      highlightText(node);
    } else {
      textCount += node.nodeValue.length;
    }
  }

  /**
   * 
   */
  function init() {
    start();
  }

  return {
    init: init,
  }
})();

RegexHighlight.init();
