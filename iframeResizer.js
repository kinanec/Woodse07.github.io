/*
 * File: iframeResizer.js
 * Desc: Force iframes to size to content.
 * Requires: iframeResizer.contentWindow.js to be loaded into the target frame.
 * Author: David J. Bradshaw - dave@bradshaw.net
 * Contributor: Jure Mav - jure.mav@gmail.com
 * Contributor: Reed Dadoune - reed@dadoune.com
 */
;
(function() {
    'use strict';

    var
        count = 0,
        firstRun = true,
        logEnabled = false,
        msgHeader = 'message',
        msgHeaderLen = msgHeader.length,
        msgId = '[iFrameSizer]', //Must match iframe msg ID
        msgIdLen = msgId.length,
        page = '', //:'+location.href, //Uncoment to debug nested iFrames
        pagePosition = null,
        requestAnimationFrame = window.requestAnimationFrame,
        resetRequiredMethods = {
            max: 1,
            scroll: 1,
            bodyScroll: 1,
            documentElementScroll: 1
        },
        settings = {},

        defaults = {
            autoResize: true,
            bodyBackground: null,
            bodyMargin: null,
            bodyMarginV1: 8,
            bodyPadding: null,
            checkOrigin: true,
            enableInPageLinks: false,
            enablePublicMethods: false,
            heightCalculationMethod: 'offset',
            interval: 32,
            log: false,
            maxHeight: Infinity,
            maxWidth: Infinity,
            minHeight: 0,
            minWidth: 0,
            scrolling: false,
            sizeHeight: true,
            sizeWidth: false,
            tolerance: 0,
            closedCallback: function() {},
            initCallback: function() {},
            messageCallback: function() {},
            resizedCallback: function() {},
            scrollCallback: function() {
                return true;
            }
        };

    function addEventListener(obj, evt, func) {
        if ('addEventListener' in window) {
            obj.addEventListener(evt, func, false);
        } else if ('attachEvent' in window) { //IE
            obj.attachEvent('on' + evt, func);
        }
    }

    function setupRequestAnimationFrame() {
        var
            vendors = ['moz', 'webkit', 'o', 'ms'],
            x;

        // Remove vendor prefixing if prefixed and break early if not
        for (x = 0; x < vendors.length && !requestAnimationFrame; x += 1) {
            requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
        }

        if (!(requestAnimationFrame)) {
            log(' RequestAnimationFrame not supported');
        }
    }

    function getMyID() {
        var retStr = 'Host page';

        if (window.top !== window.self) {
            if (window.parentIFrame) {
                retStr = window.parentIFrame.getId();
            } else {
                retStr = 'Nested host page';
            }
        }

        return retStr;
    }

    function formatLogMsg(msg) {
        return msgId + '[' + getMyID() + ']' + msg;
    }

    function log(msg) {
        if (logEnabled && ('object' === typeof window.console)) {
            console.log(formatLogMsg(msg));
        }
    }

    function warn(msg) {
        if ('object' === typeof window.console) {
            console.warn(formatLogMsg(msg));
        }
    }


    var messageCounter = 0;

    function iFrameListener(event) {
        function resizeIFrame() {
            // ----------------------------- Infinite Scroll ----------------------------

            function throttle(func, wait, options) {
                var context, args, result;
                var timeout = null;
                var previous = 0;
                options || (options = {});
                var later = function() {
                    previous = options.leading === false ? 0 : Date.now();
                    timeout = null;
                    result = func.apply(context, args);
                    context = args = null;
                };
                return function() {
                    var now = Date.now();
                    if (!previous && options.leading === false) previous = now;
                    var remaining = wait - (now - previous);
                    context = this;
                    args = arguments;
                    if (remaining <= 0) {
                        clearTimeout(timeout);
                        timeout = null;
                        previous = now;
                        result = func.apply(context, args);
                        context = args = null;
                    } else if (!timeout && options.trailing !== false) {
                        timeout = setTimeout(later, remaining);
                    }
                    return result;
                };
            };

            function sendLoadMoreMessage() {
                var loadMoreMessage = {
                    name: 'pixlee:infinite:load:more',
                    type: 'relay',
                    source: 'parent',
                    destination: 'widget',
                    data: {}
                };

                window.top.postMessage(JSON.stringify(loadMoreMessage), '*');
            }

            function scrollIframe() {
                var browserHeight = isNaN(window.innerHeight) ? window.clientHeight : window.innerHeight;
                var scrollTop = Math.max(window.pageYOffset, document.documentElement.scrollTop, document.body.scrollTop);
                var offsetTop = messageData.iframe.offsetTop;
                var offsetHeight = messageData.iframe.offsetHeight;
                // Trigger Infinite load when we are 25% away from the bottom of the page
                var bufferSpace = (offsetTop + offsetHeight) * 0.25;
                if ((scrollTop + browserHeight) >= (offsetTop + offsetHeight - bufferSpace)) {
                    sendLoadMoreMessage();
                }
            }

            window.onscroll = throttle(function() {
                scrollIframe();
            }, 500);

            // --------------------------------------------------------------------------
            var currentWindowDimensions = {
                width: window.innerWidth,
                height: window.innerHeight
            };
            function resize() {
                setSize(messageData);
                setPagePosition();

                // --------------------RESPONSIVE WIDGET------------------------------------
                var widgetShape;

                function debounce(func, wait, immediate) {
                    var timeout, args, context, timestamp, result;

                    var later = function() {
                        var last = Date.now() - timestamp;
                        if (last < wait) {
                            timeout = setTimeout(later, wait - last);
                        } else {
                            timeout = null;
                            if (!immediate) {
                                result = func.apply(context, args);
                                context = args = null;
                            }
                        }
                    };

                    return function() {
                        context = this;
                        args = arguments;
                        timestamp = Date.now();
                        var callNow = immediate && !timeout;
                        if (!timeout) {
                            timeout = setTimeout(later, wait);
                        }
                        if (callNow) {
                            result = func.apply(context, args);
                            context = args = null;
                        }

                        return result;
                    };
                }

                function convertToInt(string) {
                    var pxInteger = (string === "") ? 0 : parseFloat(string.replace('px', ''));
                    return pxInteger;
                }

                function getComputedStyle(attr) {
                    return window.getComputedStyle(messageData.iframe.parentElement.parentElement).getPropertyValue(attr);
                }

                function getDimensions() {
                    var paddingLeft = 400,
                        paddingRight = 400,
                        paddingTop = convertToInt(getComputedStyle('padding-top')),
                        paddingBottom = convertToInt(getComputedStyle('padding-bottom')),
                        width = convertToInt(getComputedStyle('width')) - paddingLeft - paddingRight,
                        height = convertToInt(getComputedStyle('height')) - paddingTop - paddingBottom;

                    var dimensions = {
                        height: height,
                        width: width
                    };

                    return dimensions;

                }

                // sends dimensions to widget to size accordingly to new iframe dimensions
                function sendResizeWidgetMessage() {
                    var dimensions = getDimensions();

                    var resizeWidgetMessage = {
                        name: 'pixlee:resize:widget',
                        type: 'relay',
                        source: 'parent',
                        destination: 'widget',
                        data: {
                            height: dimensions.height,
                            width: dimensions.width
                        }
                    };

                    window.top.postMessage(JSON.stringify(resizeWidgetMessage), '*');

                }

                // Resizes iframe
                function reloadIframe() {
                    if (!document.getElementById(messageData.iframe.id)) {
                        return false;
                    }

                    var dimensions = getDimensions();
                    var height = dimensions.height;
                    var width = dimensions.width;
                    var message = {
                        id: messageData.id,
                        iframe: messageData.iframe,
                        type: messageData.type
                    };


                    if (widgetShape === 'square') {
                        if (width > height) {
                            message.height = Math.floor(height);
                            message.width = Math.floor(height);
                        } else {
                            message.height = Math.floor(width);
                            message.width = Math.floor(width);
                        }
                    } else if (widgetShape === 'vertical') {
                        // Need to manually send send message because iframeresizer 
                        // only sends width in function createOutgoingMsg
                        message.height = height;
                        sendResizeWidgetMessage();
                    } else {
                        message.width = width;
                    }

                    setSize(message);
                }

                var resizeTimer;


                // Receives widget type so that the iframe can resize accordingly 
                // (example: slideshow must always be a square)
                var receiveMessage = function(event) {
                    try {
                        var eventData = JSON.parse(event.data);

                        if (eventData.name === 'pixlee:widget:shape') {
                            if (eventData.data.type === 'square') {
                                widgetShape = 'square';
                            } else if (eventData.data.type === 'vertical') {
                                widgetShape = 'vertical';
                                // Check if the parent DIV or pixlee_container has a height set. If not, it will keep on resizing and break the page
                                // The default size is set to 1000px on pixlee_container if no height attribute is found
                                var pixleeContainer = messageData.iframe.parentElement;
                                var pixleeHeight = pixleeContainer.style.height;
                                var parentElem = pixleeContainer.parentElement;
                                var parentElemHeight = parentElem.style.height;
                                var fallbackHeight = '1000px';

                                if (!parentElemHeight || parentElemHeight === '100%') {
                                    if (!pixleeHeight || pixleeHeight === '100%') {
                                        $(pixleeContainer).css('height', fallbackHeight);
                                    }
                                }

                            }
                        } else if (eventData.name === 'pixlee:scroll:mosaic:mobile') {
                            // hack on mobile. mobile lightbox disappears when opened. triggering a scroll to show lightbox
                            setTimeout(function() {
                                var windowXPos = window.pageXOffset;
                                var newWindowYPos = window.pageYOffset + 1;
                                window.scrollTo(windowXPos, newWindowYPos);
                            }, 1000);
                        }
                    } catch (e) {
                        // console.log('invalid json');
                        return;
                    }
                };


                sendResizeWidgetMessage();

                // checks to see if iframe shoulds be reloaded. 
                // example: will not reload vertical if width is adjusted but will reload for height resize
                var reloadDebounce = debounce(function() {
                    // Note: Mobile scroll triggers window resize. 
                    if (widgetShape === 'vertical') {
                        if (currentWindowDimensions.height !== window.innerHeight) {
                            reloadIframe();
                            currentWindowDimensions.height = window.innerHeight;
                        }
                    }

                    if (widgetShape !== 'vertical' && widgetShape !== 'undefined') {
                        if (currentWindowDimensions.width !== window.innerWidth) {
                            reloadIframe();
                            currentWindowDimensions.width = window.innerWidth;
                        }
                    }
                }, 250);

                window.addEventListener('resize', reloadDebounce, false);
                window.addEventListener('message', receiveMessage, false);



                // --------------------------------------------------------------------------


                settings[iframeID].resizedCallback(messageData);
            }

            ensureInRange('Height');
            ensureInRange('Width');

            syncResize(resize, messageData, 'resetPage');
        }

        function closeIFrame(iframe) {
            var iframeID = iframe.id;

            log(' Removing iFrame: ' + iframeID);
            iframe.parentNode.removeChild(iframe);
            settings[iframeID].closedCallback(iframeID);
            log(' --');
        }

        function processMsg() {
            var data = msg.substr(msgIdLen).split(':');

            return {
                iframe: document.getElementById(data[0]),
                id: data[0],
                height: data[1],
                width: data[2],
                type: data[3]
            };
        }

        function ensureInRange(Dimension) {
            var
                max = Number(settings[iframeID]['max' + Dimension]),
                min = Number(settings[iframeID]['min' + Dimension]),
                dimension = Dimension.toLowerCase(),
                size = Number(messageData[dimension]);

            if (min > max) {
                throw new Error('Value for min' + Dimension + ' can not be greater than max' + Dimension);
            }

            log(' Checking ' + dimension + ' is in range ' + min + '-' + max);

            if (size < min) {
                size = min;
                log(' Set ' + dimension + ' to min value');
            }

            if (size > max) {
                size = max;
                log(' Set ' + dimension + ' to max value');
            }

            messageData[dimension] = '' + size;
        }

        function isMessageFromIFrame() {
            var
                origin = event.origin,
                remoteHost = messageData.iframe.src.split('/').slice(0, 3).join('/');

            if (settings[iframeID].checkOrigin) {
                log(' Checking connection is from: ' + remoteHost);

                if (('' + origin !== 'null') && (origin !== remoteHost)) {
                    throw new Error(
                        'Unexpected message received from: ' + origin +
                        ' for ' + messageData.iframe.id +
                        '. Message was: ' + event.data +
                        '. This error can be disabled by adding the checkOrigin: false option.'
                    );
                }
            }

            return true;
        }

        function isMessageForUs() {
            return msgId === ('' + msg).substr(0, msgIdLen); //''+Protects against non-string msg
        }

        function isMessageFromMetaParent() {
            //test if this message is from a parent above us. This is an ugly test, however, updating
            //the message format would break backwards compatibity.
            var retCode = messageData.type in {
                'true': 1,
                'false': 1
            };

            if (retCode) {
                log(' Ignoring init message from meta parent page');
            }

            return retCode;
        }

        function getMsgBody(offset) {
            return msg.substr(msg.indexOf(':') + msgHeaderLen + offset);
        }

        function forwardMsgFromIFrame(msgBody) {
            log(' MessageCallback passed: {iframe: ' + messageData.iframe.id + ', message: ' + msgBody + '}');
            settings[iframeID].messageCallback({
                iframe: messageData.iframe,
                message: JSON.parse(msgBody)
            });
            log(' --');
        }

        function checkIFrameExists() {
            if (null === messageData.iframe) {
                throw new Error('iFrame (' + messageData.id + ') does not exist on ' + page);
            }
            return true;
        }

        function getElementPosition(target) {
            var
                iFramePosition = target.getBoundingClientRect();

            getPagePosition();

            return {
                x: parseInt(iFramePosition.left, 10) + parseInt(pagePosition.x, 10),
                y: parseInt(iFramePosition.top, 10) + parseInt(pagePosition.y, 10)
            };
        }

        function scrollRequestFromChild(addOffset) {
            function reposition() {
                pagePosition = newPosition;

                scrollTo();

                log(' --');
            }

            function calcOffset() {
                return {
                    x: Number(messageData.width) + offset.x,
                    y: Number(messageData.height) + offset.y
                };
            }

            var
                offset = addOffset ? getElementPosition(messageData.iframe) : {
                    x: 0,
                    y: 0
                },
                newPosition = calcOffset();

            log(' Reposition requested from iFrame (offset x:' + offset.x + ' y:' + offset.y + ')');

            if (window.top !== window.self) {
                if (window.parentIFrame) {
                    if (addOffset) {
                        parentIFrame.scrollToOffset(newPosition.x, newPosition.y);
                    } else {
                        parentIFrame.scrollTo(messageData.width, messageData.height);
                    }
                } else {
                    warn(' Unable to scroll to requested position, window.parentIFrame not found');
                }
            } else {
                reposition();
            }

        }

        function scrollTo() {
            if (false !== settings[iframeID].scrollCallback(pagePosition)) {
                setPagePosition();
            }
        }

        function findTarget(location) {
            var hash = location.split("#")[1] || "";
            var hashData = decodeURIComponent(hash);

            function jumpToTarget(target) {
                var jumpPosition = getElementPosition(target);

                log(' Moving to in page link (#' + hash + ') at x: ' + jumpPosition.x + ' y: ' + jumpPosition.y);
                pagePosition = {
                    x: jumpPosition.x,
                    y: jumpPosition.y
                };

                scrollTo();
                log(' --');
            }

            var target = document.getElementById(hashData) || document.getElementsByName(hashData)[0];

            if (window.top !== window.self) {
                if (window.parentIFrame) {
                    parentIFrame.moveToAnchor(hash);
                } else {
                    log(' In page link #' + hash + ' not found and window.parentIFrame not found');
                }
            } else if (target) {
                jumpToTarget(target);
            } else {
                log(' In page link #' + hash + ' not found');
            }
        }

        function actionMsg() {
            switch (messageData.type) {
                case 'close':
                    closeIFrame(messageData.iframe);
                    settings[iframeID].resizedCallback(messageData); //To be removed.
                    break;
                case 'message':
                    forwardMsgFromIFrame(getMsgBody(6));
                    break;
                case 'scrollTo':
                    scrollRequestFromChild(false);
                    break;
                case 'scrollToOffset':
                    scrollRequestFromChild(true);
                    break;
                case 'inPageLink':
                    findTarget(getMsgBody(9));
                    break;
                case 'reset':
                    resetIFrame(messageData);
                    break;
                case 'init':
                    resizeIFrame();
                    settings[iframeID].initCallback(messageData.iframe);
                    break;
                default:
                    resizeIFrame();
            }
        }

        var
            msg = event.data,
            messageData = {},
            iframeID = null;

        if (isMessageForUs()) {
            messageData = processMsg();
            iframeID = messageData.id;
            logEnabled = settings[iframeID].log;
            log(' Received: ' + msg);

            if (!isMessageFromMetaParent() && checkIFrameExists() && isMessageFromIFrame()) {
                actionMsg();
                firstRun = false;
            }
        }
    }


    function getPagePosition() {
        if (null === pagePosition) {
            pagePosition = {
                x: (window.pageXOffset !== undefined) ? window.pageXOffset : document.documentElement.scrollLeft,
                y: (window.pageYOffset !== undefined) ? window.pageYOffset : document.documentElement.scrollTop
            };
            log(' Get page position: ' + pagePosition.x + ',' + pagePosition.y);
        }
    }

    function setPagePosition() {
        if (null !== pagePosition) {
            window.scrollTo(pagePosition.x, pagePosition.y);
            log(' Set page position: ' + pagePosition.x + ',' + pagePosition.y);
            pagePosition = null;
        }
    }

    function resetIFrame(messageData) {
        function reset() {
            setSize(messageData);
            trigger('reset', 'reset', messageData.iframe);
        }

        log(' Size reset requested by ' + ('init' === messageData.type ? 'host page' : 'iFrame'));
        getPagePosition();
        syncResize(reset, messageData, 'init');
    }

    function setSize(messageData) {
        function setDimension(dimension) {
            messageData.iframe.style[dimension] = messageData[dimension] + 'px';
            log(
                ' IFrame (' + iframeID +
                ') ' + dimension +
                ' set to ' + messageData[dimension] + 'px'
            );
        }
        var iframeID = messageData.iframe.id;
        if (settings[iframeID].sizeHeight) {
            setDimension('height');
        }
        if (settings[iframeID].sizeWidth) {
            setDimension('width');
        }
    }

    function syncResize(func, messageData, doNotSync) {
        if (doNotSync !== messageData.type && requestAnimationFrame) {
            log(' Requesting animation frame');
            requestAnimationFrame(func);
        } else {
            func();
        }
    }

    function trigger(calleeMsg, msg, iframe) {
        log('[' + calleeMsg + '] Sending msg to iframe (' + msg + ')');
        iframe.contentWindow.postMessage(msgId + msg, '*');
    }


    function setupIFrame(options) {
        function setLimits() {
            function addStyle(style) {
                if ((Infinity !== settings[iframeID][style]) && (0 !== settings[iframeID][style])) {
                    iframe.style[style] = settings[iframeID][style] + 'px';
                    log(' Set ' + style + ' = ' + settings[iframeID][style] + 'px');
                }
            }

            addStyle('maxHeight');
            addStyle('minHeight');
            addStyle('maxWidth');
            addStyle('minWidth');
        }

        function ensureHasId(iframeID) {
            if ('' === iframeID) {
                iframe.id = iframeID = 'iFrameResizer' + count++;
                logEnabled = (options || {}).log;
                log(' Added missing iframe ID: ' + iframeID + ' (' + iframe.src + ')');
            }

            return iframeID;
        }

        function setScrolling() {
            log(' IFrame scrolling ' + (settings[iframeID].scrolling ? 'enabled' : 'disabled') + ' for ' + iframeID);
            iframe.style.overflow = false === settings[iframeID].scrolling ? 'hidden' : 'auto';
            iframe.scrolling = false === settings[iframeID].scrolling ? 'no' : 'yes';
        }

        //The V1 iFrame script expects an int, where as in V2 expects a CSS
        //string value such as '1px 3em', so if we have an int for V2, set V1=V2
        //and then convert V2 to a string PX value.
        function setupBodyMarginValues() {
            if (('number' === typeof(settings[iframeID].bodyMargin)) || ('0' === settings[iframeID].bodyMargin)) {
                settings[iframeID].bodyMarginV1 = settings[iframeID].bodyMargin;
                settings[iframeID].bodyMargin = '' + settings[iframeID].bodyMargin + 'px';
            }
        }

        function createOutgoingMsg() {
            return iframeID +
                ':' + settings[iframeID].bodyMarginV1 +
                ':' + settings[iframeID].sizeWidth +
                ':' + settings[iframeID].log +
                ':' + settings[iframeID].interval +
                ':' + settings[iframeID].enablePublicMethods +
                ':' + settings[iframeID].autoResize +
                ':' + settings[iframeID].bodyMargin +
                ':' + settings[iframeID].heightCalculationMethod +
                ':' + settings[iframeID].bodyBackground +
                ':' + settings[iframeID].bodyPadding +
                ':' + settings[iframeID].tolerance +
                ':' + settings[iframeID].enableInPageLinks;
        }

        function init(msg) {
            //We have to call trigger twice, as we can not be sure if all
            //iframes have completed loading when this code runs. The
            //event listener also catches the page changing in the iFrame.
            addEventListener(iframe, 'load', function() {
                var fr = firstRun; // Reduce scope of var to function, because IE8's JS execution
                // context stack is borked and this value gets externally
                // changed midway through running this function.
                trigger('iFrame.onload', msg, iframe);
                if (!fr && settings[iframeID].heightCalculationMethod in resetRequiredMethods) {
                    resetIFrame({
                        iframe: iframe,
                        height: 0,
                        width: 0,
                        type: 'init'
                    });
                }
            });
            trigger('init', msg, iframe);
        }

        function checkOptions(options) {
            if ('object' !== typeof options) {
                throw new TypeError('Options is not an object.');
            }
        }

        function processOptions(options) {
            options = options || {};
            settings[iframeID] = {};

            checkOptions(options);

            for (var option in defaults) {
                if (defaults.hasOwnProperty(option)) {
                    settings[iframeID][option] = options.hasOwnProperty(option) ? options[option] : defaults[option];
                }
            }

            logEnabled = settings[iframeID].log;
        }

        var
        /*jshint validthis:true */
            iframe = this,
            iframeID = ensureHasId(iframe.id);

        processOptions(options);
        setScrolling();
        setLimits();
        setupBodyMarginValues();
        init(createOutgoingMsg());
    }


    function factory() {
        setupRequestAnimationFrame();
        addEventListener(window, 'message', iFrameListener);

        function init(element, options) {
            if (!element.tagName) {
                throw new TypeError('Object is not a valid DOM element');
            } else if ('IFRAME' !== element.tagName.toUpperCase()) {
                throw new TypeError('Expected <IFRAME> tag, found <' + element.tagName + '>.');
            } else {
                setupIFrame.call(element, options);
            }
        }

        return function iFrameResizeF(options, target) {
            switch (typeof(target)) {
                case 'undefined':
                case 'string':
                    Array.prototype.forEach.call(document.querySelectorAll(target || 'iframe'), function(element) {
                        init(element, options);
                    });
                    break;
                case 'object':
                    init(target, options);
                    break;
                default:
                    throw new TypeError('Unexpected data type (' + typeof(target) + ').');
            }

        };
    }

    function createJQueryPublicMethod($) {
        $.fn.iFrameResize = function $iFrameResizeF(options) {
            return this.filter('iframe').each(function(index, element) {
                setupIFrame.call(element, options);
            }).end();
        };
    }


    if (window.jQuery) {
        createJQueryPublicMethod(jQuery);
    }

    window.iFrameResize = window.iFrameResize || factory();
})();
/*! Raven.js 3.8.0 (d78f15c) | github.com/getsentry/raven-js */

/*
 * Includes TraceKit
 * https://github.com/getsentry/TraceKit
 *
 * Copyright 2016 Matt Robenolt and other contributors
 * Released under the BSD license
 * https://github.com/getsentry/raven-js/blob/master/LICENSE
 *
 */

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Raven = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
exports = module.exports = stringify
exports.getSerialize = serializer

function stringify(obj, replacer, spaces, cycleReplacer) {
  return JSON.stringify(obj, serializer(replacer, cycleReplacer), spaces)
}

function serializer(replacer, cycleReplacer) {
  var stack = [], keys = []

  if (cycleReplacer == null) cycleReplacer = function(key, value) {
    if (stack[0] === value) return "[Circular ~]"
    return "[Circular ~." + keys.slice(0, stack.indexOf(value)).join(".") + "]"
  }

  return function(key, value) {
    if (stack.length > 0) {
      var thisPos = stack.indexOf(this)
      ~thisPos ? stack.splice(thisPos + 1) : stack.push(this)
      ~thisPos ? keys.splice(thisPos, Infinity, key) : keys.push(key)
      if (~stack.indexOf(value)) value = cycleReplacer.call(this, key, value)
    }
    else stack.push(value)

    return replacer == null ? value : replacer.call(this, key, value)
  }
}

},{}],2:[function(_dereq_,module,exports){
'use strict';

function RavenConfigError(message) {
    this.name = 'RavenConfigError';
    this.message = message;
}
RavenConfigError.prototype = new Error();
RavenConfigError.prototype.constructor = RavenConfigError;

module.exports = RavenConfigError;

},{}],3:[function(_dereq_,module,exports){
'use strict';

var wrapMethod = function(console, level, callback) {
    var originalConsoleLevel = console[level];
    var originalConsole = console;

    if (!(level in console)) {
        return;
    }

    var sentryLevel = level === 'warn'
        ? 'warning'
        : level;

    console[level] = function () {
        var args = [].slice.call(arguments);

        var msg = '' + args.join(' ');
        var data = {level: sentryLevel, logger: 'console', extra: {'arguments': args}};
        callback && callback(msg, data);

        // this fails for some browsers. :(
        if (originalConsoleLevel) {
            // IE9 doesn't allow calling apply on console functions directly
            // See: https://stackoverflow.com/questions/5472938/does-ie9-support-console-log-and-is-it-a-real-function#answer-5473193
            Function.prototype.apply.call(
                originalConsoleLevel,
                originalConsole,
                args
            );
        }
    };
};

module.exports = {
    wrapMethod: wrapMethod
};

},{}],4:[function(_dereq_,module,exports){
/*global XDomainRequest:false, __DEV__:false*/
'use strict';

var TraceKit = _dereq_(6);
var RavenConfigError = _dereq_(2);
var stringify = _dereq_(1);

var wrapConsoleMethod = _dereq_(3).wrapMethod;

var dsnKeys = 'source protocol user pass host port path'.split(' '),
    dsnPattern = /^(?:(\w+):)?\/\/(?:(\w+)(:\w+)?@)?([\w\.-]+)(?::(\d+))?(\/.*)/;

function now() {
    return +new Date();
}

var _window = typeof window !== 'undefined' ? window : undefined;
var _document = _window && _window.document;

// First, check for JSON support
// If there is no JSON, we no-op the core features of Raven
// since JSON is required to encode the payload
function Raven() {
    this._hasJSON = !!(typeof JSON === 'object' && JSON.stringify);
    // Raven can run in contexts where there's no document (react-native)
    this._hasDocument = !isUndefined(_document);
    this._lastCapturedException = null;
    this._lastEventId = null;
    this._globalServer = null;
    this._globalKey = null;
    this._globalProject = null;
    this._globalContext = {};
    this._globalOptions = {
        logger: 'javascript',
        ignoreErrors: [],
        ignoreUrls: [],
        whitelistUrls: [],
        includePaths: [],
        crossOrigin: 'anonymous',
        collectWindowErrors: true,
        maxMessageLength: 0,
        stackTraceLimit: 50,
        autoBreadcrumbs: true
    };
    this._ignoreOnError = 0;
    this._isRavenInstalled = false;
    this._originalErrorStackTraceLimit = Error.stackTraceLimit;
    // capture references to window.console *and* all its methods first
    // before the console plugin has a chance to monkey patch
    this._originalConsole = _window.console || {};
    this._originalConsoleMethods = {};
    this._plugins = [];
    this._startTime = now();
    this._wrappedBuiltIns = [];
    this._breadcrumbs = [];
    this._lastCapturedEvent = null;
    this._keypressTimeout;
    this._location = _window.location;
    this._lastHref = this._location && this._location.href;

    for (var method in this._originalConsole) {  // eslint-disable-line guard-for-in
      this._originalConsoleMethods[method] = this._originalConsole[method];
    }
}

/*
 * The core Raven singleton
 *
 * @this {Raven}
 */

Raven.prototype = {
    // Hardcode version string so that raven source can be loaded directly via
    // webpack (using a build step causes webpack #1617). Grunt verifies that
    // this value matches package.json during build.
    //   See: https://github.com/getsentry/raven-js/issues/465
    VERSION: '3.8.0',

    debug: false,

    TraceKit: TraceKit, // alias to TraceKit

    /*
     * Configure Raven with a DSN and extra options
     *
     * @param {string} dsn The public Sentry DSN
     * @param {object} options Optional set of of global options [optional]
     * @return {Raven}
     */
    config: function(dsn, options) {
        var self = this;

        if (self._globalServer) {
                this._logDebug('error', 'Error: Raven has already been configured');
            return self;
        }
        if (!dsn) return self;

        var globalOptions = self._globalOptions;

        // merge in options
        if (options) {
            each(options, function(key, value){
                // tags and extra are special and need to be put into context
                if (key === 'tags' || key === 'extra') {
                    self._globalContext[key] = value;
                } else {
                    globalOptions[key] = value;
                }
            });
        }

        self.setDSN(dsn);

        // "Script error." is hard coded into browsers for errors that it can't read.
        // this is the result of a script being pulled in from an external domain and CORS.
        globalOptions.ignoreErrors.push(/^Script error\.?$/);
        globalOptions.ignoreErrors.push(/^Javascript error: Script error\.? on line 0$/);

        // join regexp rules into one big rule
        globalOptions.ignoreErrors = joinRegExp(globalOptions.ignoreErrors);
        globalOptions.ignoreUrls = globalOptions.ignoreUrls.length ? joinRegExp(globalOptions.ignoreUrls) : false;
        globalOptions.whitelistUrls = globalOptions.whitelistUrls.length ? joinRegExp(globalOptions.whitelistUrls) : false;
        globalOptions.includePaths = joinRegExp(globalOptions.includePaths);
        globalOptions.maxBreadcrumbs = Math.max(0, Math.min(globalOptions.maxBreadcrumbs || 100, 100)); // default and hard limit is 100

        var autoBreadcrumbDefaults = {
            xhr: true,
            console: true,
            dom: true,
            location: true,
        };

        var autoBreadcrumbs = globalOptions.autoBreadcrumbs;
        if ({}.toString.call(autoBreadcrumbs) === '[object Object]') {
            autoBreadcrumbs = objectMerge(autoBreadcrumbDefaults, autoBreadcrumbs);
        } else if (autoBreadcrumbs !== false) {
            autoBreadcrumbs = autoBreadcrumbDefaults;
        }
        globalOptions.autoBreadcrumbs = autoBreadcrumbs;

        TraceKit.collectWindowErrors = !!globalOptions.collectWindowErrors;

        // return for chaining
        return self;
    },

    /*
     * Installs a global window.onerror error handler
     * to capture and report uncaught exceptions.
     * At this point, install() is required to be called due
     * to the way TraceKit is set up.
     *
     * @return {Raven}
     */
    install: function() {
        var self = this;
        if (self.isSetup() && !self._isRavenInstalled) {
            TraceKit.report.subscribe(function () {
                self._handleOnErrorStackInfo.apply(self, arguments);
            });
            self._instrumentTryCatch();
            if (self._globalOptions.autoBreadcrumbs)
                self._instrumentBreadcrumbs();

            // Install all of the plugins
            self._drainPlugins();

            self._isRavenInstalled = true;
        }

        Error.stackTraceLimit = self._globalOptions.stackTraceLimit;
        return this;
    },

    /*
     * Set the DSN (can be called multiple time unlike config)
     *
     * @param {string} dsn The public Sentry DSN
     */
    setDSN: function(dsn) {
        var self = this,
            uri = self._parseDSN(dsn),
          lastSlash = uri.path.lastIndexOf('/'),
          path = uri.path.substr(1, lastSlash);

        self._dsn = dsn;
        self._globalKey = uri.user;
        self._globalSecret = uri.pass && uri.pass.substr(1);
        self._globalProject = uri.path.substr(lastSlash + 1);

        self._globalServer = self._getGlobalServer(uri);

        self._globalEndpoint = self._globalServer +
            '/' + path + 'api/' + self._globalProject + '/store/';
    },

    /*
     * Wrap code within a context so Raven can capture errors
     * reliably across domains that is executed immediately.
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The callback to be immediately executed within the context
     * @param {array} args An array of arguments to be called with the callback [optional]
     */
    context: function(options, func, args) {
        if (isFunction(options)) {
            args = func || [];
            func = options;
            options = undefined;
        }

        return this.wrap(options, func).apply(this, args);
    },

    /*
     * Wrap code within a context and returns back a new function to be executed
     *
     * @param {object} options A specific set of options for this context [optional]
     * @param {function} func The function to be wrapped in a new context
     * @param {function} func A function to call before the try/catch wrapper [optional, private]
     * @return {function} The newly wrapped functions with a context
     */
    wrap: function(options, func, _before) {
        var self = this;
        // 1 argument has been passed, and it's not a function
        // so just return it
        if (isUndefined(func) && !isFunction(options)) {
            return options;
        }

        // options is optional
        if (isFunction(options)) {
            func = options;
            options = undefined;
        }

        // At this point, we've passed along 2 arguments, and the second one
        // is not a function either, so we'll just return the second argument.
        if (!isFunction(func)) {
            return func;
        }

        // We don't wanna wrap it twice!
        try {
            if (func.__raven__) {
                return func;
            }

            // If this has already been wrapped in the past, return that
            if (func.__raven_wrapper__ ){
                return func.__raven_wrapper__ ;
            }
        } catch (e) {
            // Just accessing custom props in some Selenium environments
            // can cause a "Permission denied" exception (see raven-js#495).
            // Bail on wrapping and return the function as-is (defers to window.onerror).
            return func;
        }

        function wrapped() {
            var args = [], i = arguments.length,
                deep = !options || options && options.deep !== false;

            if (_before && isFunction(_before)) {
                _before.apply(this, arguments);
            }

            // Recursively wrap all of a function's arguments that are
            // functions themselves.
            while(i--) args[i] = deep ? self.wrap(options, arguments[i]) : arguments[i];

            try {
                return func.apply(this, args);
            } catch(e) {
                self._ignoreNextOnError();
                self.captureException(e, options);
                throw e;
            }
        }

        // copy over properties of the old function
        for (var property in func) {
            if (hasKey(func, property)) {
                wrapped[property] = func[property];
            }
        }
        wrapped.prototype = func.prototype;

        func.__raven_wrapper__ = wrapped;
        // Signal that this function has been wrapped already
        // for both debugging and to prevent it to being wrapped twice
        wrapped.__raven__ = true;
        wrapped.__inner__ = func;

        return wrapped;
    },

    /*
     * Uninstalls the global error handler.
     *
     * @return {Raven}
     */
    uninstall: function() {
        TraceKit.report.uninstall();

        this._restoreBuiltIns();

        Error.stackTraceLimit = this._originalErrorStackTraceLimit;
        this._isRavenInstalled = false;

        return this;
    },

    /*
     * Manually capture an exception and send it over to Sentry
     *
     * @param {error} ex An exception to be logged
     * @param {object} options A specific set of options for this error [optional]
     * @return {Raven}
     */
    captureException: function(ex, options) {
        // If not an Error is passed through, recall as a message instead
        if (!isError(ex)) {
            return this.captureMessage(ex, objectMerge({
                trimHeadFrames: 1,
                stacktrace: true // if we fall back to captureMessage, default to attempting a new trace
            }, options));
        }

        // Store the raw exception object for potential debugging and introspection
        this._lastCapturedException = ex;

        // TraceKit.report will re-raise any exception passed to it,
        // which means you have to wrap it in try/catch. Instead, we
        // can wrap it here and only re-raise if TraceKit.report
        // raises an exception different from the one we asked to
        // report on.
        try {
            var stack = TraceKit.computeStackTrace(ex);
            this._handleStackInfo(stack, options);
        } catch(ex1) {
            if(ex !== ex1) {
                throw ex1;
            }
        }

        return this;
    },

    /*
     * Manually send a message to Sentry
     *
     * @param {string} msg A plain message to be captured in Sentry
     * @param {object} options A specific set of options for this message [optional]
     * @return {Raven}
     */
    captureMessage: function(msg, options) {
        // config() automagically converts ignoreErrors from a list to a RegExp so we need to test for an
        // early call; we'll error on the side of logging anything called before configuration since it's
        // probably something you should see:
        if (!!this._globalOptions.ignoreErrors.test && this._globalOptions.ignoreErrors.test(msg)) {
            return;
        }

        var data = objectMerge({
            message: msg + ''  // Make sure it's actually a string
        }, options);

        if (options && options.stacktrace) {
            var ex;
            // create a stack trace from this point; just trim
            // off extra frames so they don't include this function call (or
            // earlier Raven.js library fn calls)
            try {
                throw new Error(msg);
            } catch (ex1) {
                ex = ex1;
            }

            // null exception name so `Error` isn't prefixed to msg
            ex.name = null;

            options = objectMerge({
                // fingerprint on msg, not stack trace (legacy behavior, could be
                // revisited)
                fingerprint: msg,
                trimHeadFrames: (options.trimHeadFrames || 0) + 1
            }, options);

            var stack = TraceKit.computeStackTrace(ex);
            var frames = this._prepareFrames(stack, options);
            data.stacktrace = {
                // Sentry expects frames oldest to newest
                frames: frames.reverse()
            }
        }

        // Fire away!
        this._send(data);

        return this;
    },

    captureBreadcrumb: function (obj) {
        var crumb = objectMerge({
            timestamp: now() / 1000
        }, obj);

        this._breadcrumbs.push(crumb);
        if (this._breadcrumbs.length > this._globalOptions.maxBreadcrumbs) {
            this._breadcrumbs.shift();
        }
        return this;
    },

    addPlugin: function(plugin /*arg1, arg2, ... argN*/) {
        var pluginArgs = [].slice.call(arguments, 1);

        this._plugins.push([plugin, pluginArgs]);
        if (this._isRavenInstalled) {
            this._drainPlugins();
        }

        return this;
    },

    /*
     * Set/clear a user to be sent along with the payload.
     *
     * @param {object} user An object representing user data [optional]
     * @return {Raven}
     */
    setUserContext: function(user) {
        // Intentionally do not merge here since that's an unexpected behavior.
        this._globalContext.user = user;

        return this;
    },

    /*
     * Merge extra attributes to be sent along with the payload.
     *
     * @param {object} extra An object representing extra data [optional]
     * @return {Raven}
     */
    setExtraContext: function(extra) {
        this._mergeContext('extra', extra);

        return this;
    },

    /*
     * Merge tags to be sent along with the payload.
     *
     * @param {object} tags An object representing tags [optional]
     * @return {Raven}
     */
    setTagsContext: function(tags) {
        this._mergeContext('tags', tags);

        return this;
    },

    /*
     * Clear all of the context.
     *
     * @return {Raven}
     */
    clearContext: function() {
        this._globalContext = {};

        return this;
    },

    /*
     * Get a copy of the current context. This cannot be mutated.
     *
     * @return {object} copy of context
     */
    getContext: function() {
        // lol javascript
        return JSON.parse(stringify(this._globalContext));
    },


    /*
     * Set environment of application
     *
     * @param {string} environment Typically something like 'production'.
     * @return {Raven}
     */
    setEnvironment: function(environment) {
        this._globalOptions.environment = environment;

        return this;
    },

    /*
     * Set release version of application
     *
     * @param {string} release Typically something like a git SHA to identify version
     * @return {Raven}
     */
    setRelease: function(release) {
        this._globalOptions.release = release;

        return this;
    },

    /*
     * Set the dataCallback option
     *
     * @param {function} callback The callback to run which allows the
     *                            data blob to be mutated before sending
     * @return {Raven}
     */
    setDataCallback: function(callback) {
        var original = this._globalOptions.dataCallback;
        this._globalOptions.dataCallback = isFunction(callback)
          ? function (data) { return callback(data, original); }
          : callback;

        return this;
    },

    /*
     * Set the shouldSendCallback option
     *
     * @param {function} callback The callback to run which allows
     *                            introspecting the blob before sending
     * @return {Raven}
     */
    setShouldSendCallback: function(callback) {
        var original = this._globalOptions.shouldSendCallback;
        this._globalOptions.shouldSendCallback = isFunction(callback)
            ? function (data) { return callback(data, original); }
            : callback;

        return this;
    },

    /**
     * Override the default HTTP transport mechanism that transmits data
     * to the Sentry server.
     *
     * @param {function} transport Function invoked instead of the default
     *                             `makeRequest` handler.
     *
     * @return {Raven}
     */
    setTransport: function(transport) {
        this._globalOptions.transport = transport;

        return this;
    },

    /*
     * Get the latest raw exception that was captured by Raven.
     *
     * @return {error}
     */
    lastException: function() {
        return this._lastCapturedException;
    },

    /*
     * Get the last event id
     *
     * @return {string}
     */
    lastEventId: function() {
        return this._lastEventId;
    },

    /*
     * Determine if Raven is setup and ready to go.
     *
     * @return {boolean}
     */
    isSetup: function() {
        if (!this._hasJSON) return false;  // needs JSON support
        if (!this._globalServer) {
            if (!this.ravenNotConfiguredError) {
              this.ravenNotConfiguredError = true;
              this._logDebug('error', 'Error: Raven has not been configured.');
            }
            return false;
        }
        return true;
    },

    afterLoad: function () {
        // TODO: remove window dependence?

        // Attempt to initialize Raven on load
        var RavenConfig = _window.RavenConfig;
        if (RavenConfig) {
            this.config(RavenConfig.dsn, RavenConfig.config).install();
        }
    },

    showReportDialog: function (options) {
        if (!_document) // doesn't work without a document (React native)
            return;

        options = options || {};

        var lastEventId = options.eventId || this.lastEventId();
        if (!lastEventId) {
            throw new RavenConfigError('Missing eventId');
        }

        var dsn = options.dsn || this._dsn;
        if (!dsn) {
            throw new RavenConfigError('Missing DSN');
        }

        var encode = encodeURIComponent;
        var qs = '';
        qs += '?eventId=' + encode(lastEventId);
        qs += '&dsn=' + encode(dsn);

        var user = options.user || this._globalContext.user;
        if (user) {
            if (user.name)  qs += '&name=' + encode(user.name);
            if (user.email) qs += '&email=' + encode(user.email);
        }

        var globalServer = this._getGlobalServer(this._parseDSN(dsn));

        var script = _document.createElement('script');
        script.async = true;
        script.src = globalServer + '/api/embed/error-page/' + qs;
        (_document.head || _document.body).appendChild(script);
    },

    /**** Private functions ****/
    _ignoreNextOnError: function () {
        var self = this;
        this._ignoreOnError += 1;
        setTimeout(function () {
            // onerror should trigger before setTimeout
            self._ignoreOnError -= 1;
        });
    },

    _triggerEvent: function(eventType, options) {
        // NOTE: `event` is a native browser thing, so let's avoid conflicting wiht it
        var evt, key;

        if (!this._hasDocument)
            return;

        options = options || {};

        eventType = 'raven' + eventType.substr(0,1).toUpperCase() + eventType.substr(1);

        if (_document.createEvent) {
            evt = _document.createEvent('HTMLEvents');
            evt.initEvent(eventType, true, true);
        } else {
            evt = _document.createEventObject();
            evt.eventType = eventType;
        }

        for (key in options) if (hasKey(options, key)) {
            evt[key] = options[key];
        }

        if (_document.createEvent) {
            // IE9 if standards
            _document.dispatchEvent(evt);
        } else {
            // IE8 regardless of Quirks or Standards
            // IE9 if quirks
            try {
                _document.fireEvent('on' + evt.eventType.toLowerCase(), evt);
            } catch(e) {
                // Do nothing
            }
        }
    },

    /**
     * Wraps addEventListener to capture UI breadcrumbs
     * @param evtName the event name (e.g. "click")
     * @returns {Function}
     * @private
     */
    _breadcrumbEventHandler: function(evtName) {
        var self = this;
        return function (evt) {
            // reset keypress timeout; e.g. triggering a 'click' after
            // a 'keypress' will reset the keypress debounce so that a new
            // set of keypresses can be recorded
            self._keypressTimeout = null;

            // It's possible this handler might trigger multiple times for the same
            // event (e.g. event propagation through node ancestors). Ignore if we've
            // already captured the event.
            if (self._lastCapturedEvent === evt)
                return;

            self._lastCapturedEvent = evt;
            var elem = evt.target;

            var target;

            // try/catch htmlTreeAsString because it's particularly complicated, and
            // just accessing the DOM incorrectly can throw an exception in some circumstances.
            try {
                target = htmlTreeAsString(elem);
            } catch (e) {
                target = '<unknown>';
            }

            self.captureBreadcrumb({
                category: 'ui.' + evtName, // e.g. ui.click, ui.input
                message: target
            });
        };
    },

    /**
     * Wraps addEventListener to capture keypress UI events
     * @returns {Function}
     * @private
     */
    _keypressEventHandler: function() {
        var self = this,
            debounceDuration = 1000; // milliseconds

        // TODO: if somehow user switches keypress target before
        //       debounce timeout is triggered, we will only capture
        //       a single breadcrumb from the FIRST target (acceptable?)

        return function (evt) {
            var target = evt.target,
                tagName = target && target.tagName;

            // only consider keypress events on actual input elements
            // this will disregard keypresses targeting body (e.g. tabbing
            // through elements, hotkeys, etc)
            if (!tagName || tagName !== 'INPUT' && tagName !== 'TEXTAREA' && !target.isContentEditable)
                return;

            // record first keypress in a series, but ignore subsequent
            // keypresses until debounce clears
            var timeout = self._keypressTimeout;
            if (!timeout) {
                self._breadcrumbEventHandler('input')(evt);
            }
            clearTimeout(timeout);
            self._keypressTimeout = setTimeout(function () {
               self._keypressTimeout = null;
            }, debounceDuration);
        };
    },

    /**
     * Captures a breadcrumb of type "navigation", normalizing input URLs
     * @param to the originating URL
     * @param from the target URL
     * @private
     */
    _captureUrlChange: function(from, to) {
        var parsedLoc = parseUrl(this._location.href);
        var parsedTo = parseUrl(to);
        var parsedFrom = parseUrl(from);

        // because onpopstate only tells you the "new" (to) value of location.href, and
        // not the previous (from) value, we need to track the value of the current URL
        // state ourselves
        this._lastHref = to;

        // Use only the path component of the URL if the URL matches the current
        // document (almost all the time when using pushState)
        if (parsedLoc.protocol === parsedTo.protocol && parsedLoc.host === parsedTo.host)
            to = parsedTo.relative;
        if (parsedLoc.protocol === parsedFrom.protocol && parsedLoc.host === parsedFrom.host)
            from = parsedFrom.relative;

        this.captureBreadcrumb({
            category: 'navigation',
            data: {
                to: to,
                from: from
            }
        });
    },

    /**
     * Install any queued plugins
     */
    _instrumentTryCatch: function() {
        var self = this;

        var wrappedBuiltIns = self._wrappedBuiltIns;

        function wrapTimeFn(orig) {
            return function (fn, t) { // preserve arity
                // Make a copy of the arguments to prevent deoptimization
                // https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#32-leaking-arguments
                var args = new Array(arguments.length);
                for(var i = 0; i < args.length; ++i) {
                    args[i] = arguments[i];
                }
                var originalCallback = args[0];
                if (isFunction(originalCallback)) {
                    args[0] = self.wrap(originalCallback);
                }

                // IE < 9 doesn't support .call/.apply on setInterval/setTimeout, but it
                // also supports only two arguments and doesn't care what this is, so we
                // can just call the original function directly.
                if (orig.apply) {
                    return orig.apply(this, args);
                } else {
                    return orig(args[0], args[1]);
                }
            };
        }

        var autoBreadcrumbs = this._globalOptions.autoBreadcrumbs;

        function wrapEventTarget(global) {
            var proto = _window[global] && _window[global].prototype;
            if (proto && proto.hasOwnProperty && proto.hasOwnProperty('addEventListener')) {
                fill(proto, 'addEventListener', function(orig) {
                    return function (evtName, fn, capture, secure) { // preserve arity
                        try {
                            if (fn && fn.handleEvent) {
                                fn.handleEvent = self.wrap(fn.handleEvent);
                            }
                        } catch (err) {
                            // can sometimes get 'Permission denied to access property "handle Event'
                        }

                        // More breadcrumb DOM capture ... done here and not in `_instrumentBreadcrumbs`
                        // so that we don't have more than one wrapper function
                        var before;
                        if (autoBreadcrumbs && autoBreadcrumbs.dom && (global === 'EventTarget' || global === 'Node')) {
                            if (evtName === 'click'){
                                before = self._breadcrumbEventHandler(evtName);
                            } else if (evtName === 'keypress') {
                                before = self._keypressEventHandler();
                            }
                        }
                        return orig.call(this, evtName, self.wrap(fn, undefined, before), capture, secure);
                    };
                }, wrappedBuiltIns);
                fill(proto, 'removeEventListener', function (orig) {
                    return function (evt, fn, capture, secure) {
                        try {
                            fn = fn && (fn.__raven_wrapper__ ? fn.__raven_wrapper__  : fn);
                        } catch (e) {
                            // ignore, accessing __raven_wrapper__ will throw in some Selenium environments
                        }
                        return orig.call(this, evt, fn, capture, secure);
                    };
                }, wrappedBuiltIns);
            }
        }

        fill(_window, 'setTimeout', wrapTimeFn, wrappedBuiltIns);
        fill(_window, 'setInterval', wrapTimeFn, wrappedBuiltIns);
        if (_window.requestAnimationFrame) {
            fill(_window, 'requestAnimationFrame', function (orig) {
                return function (cb) {
                    return orig(self.wrap(cb));
                };
            }, wrappedBuiltIns);
        }

        // event targets borrowed from bugsnag-js:
        // https://github.com/bugsnag/bugsnag-js/blob/master/src/bugsnag.js#L666
        var eventTargets = ['EventTarget', 'Window', 'Node', 'ApplicationCache', 'AudioTrackList', 'ChannelMergerNode', 'CryptoOperation', 'EventSource', 'FileReader', 'HTMLUnknownElement', 'IDBDatabase', 'IDBRequest', 'IDBTransaction', 'KeyOperation', 'MediaController', 'MessagePort', 'ModalWindow', 'Notification', 'SVGElementInstance', 'Screen', 'TextTrack', 'TextTrackCue', 'TextTrackList', 'WebSocket', 'WebSocketWorker', 'Worker', 'XMLHttpRequest', 'XMLHttpRequestEventTarget', 'XMLHttpRequestUpload'];
        for (var i = 0; i < eventTargets.length; i++) {
            wrapEventTarget(eventTargets[i]);
        }

        var $ = _window.jQuery || _window.$;
        if ($ && $.fn && $.fn.ready) {
            fill($.fn, 'ready', function (orig) {
                return function (fn) {
                    return orig.call(this, self.wrap(fn));
                };
            }, wrappedBuiltIns);
        }
    },


    /**
     * Instrument browser built-ins w/ breadcrumb capturing
     *  - XMLHttpRequests
     *  - DOM interactions (click/typing)
     *  - window.location changes
     *  - console
     *
     * Can be disabled or individually configured via the `autoBreadcrumbs` config option
     */
    _instrumentBreadcrumbs: function () {
        var self = this;
        var autoBreadcrumbs = this._globalOptions.autoBreadcrumbs;

        var wrappedBuiltIns = self._wrappedBuiltIns;

        function wrapProp(prop, xhr) {
            if (prop in xhr && isFunction(xhr[prop])) {
                fill(xhr, prop, function (orig) {
                    return self.wrap(orig);
                }); // intentionally don't track filled methods on XHR instances
            }
        }

        if (autoBreadcrumbs.xhr && 'XMLHttpRequest' in _window) {
            var xhrproto = XMLHttpRequest.prototype;
            fill(xhrproto, 'open', function(origOpen) {
                return function (method, url) { // preserve arity

                    // if Sentry key appears in URL, don't capture
                    if (isString(url) && url.indexOf(self._globalKey) === -1) {
                        this.__raven_xhr = {
                            method: method,
                            url: url,
                            status_code: null
                        };
                    }

                    return origOpen.apply(this, arguments);
                };
            }, wrappedBuiltIns);

            fill(xhrproto, 'send', function(origSend) {
                return function (data) { // preserve arity
                    var xhr = this;

                    function onreadystatechangeHandler() {
                        if (xhr.__raven_xhr && (xhr.readyState === 1 || xhr.readyState === 4)) {
                            try {
                                // touching statusCode in some platforms throws
                                // an exception
                                xhr.__raven_xhr.status_code = xhr.status;
                            } catch (e) { /* do nothing */ }
                            self.captureBreadcrumb({
                                type: 'http',
                                category: 'xhr',
                                data: xhr.__raven_xhr
                            });
                        }
                    }

                    var props = ['onload', 'onerror', 'onprogress'];
                    for (var j = 0; j < props.length; j++) {
                        wrapProp(props[j], xhr);
                    }

                    if ('onreadystatechange' in xhr && isFunction(xhr.onreadystatechange)) {
                        fill(xhr, 'onreadystatechange', function (orig) {
                            return self.wrap(orig, undefined, onreadystatechangeHandler);
                        } /* intentionally don't track this instrumentation */);
                    } else {
                        // if onreadystatechange wasn't actually set by the page on this xhr, we
                        // are free to set our own and capture the breadcrumb
                        xhr.onreadystatechange = onreadystatechangeHandler;
                    }

                    return origSend.apply(this, arguments);
                };
            }, wrappedBuiltIns);
        }

        if (autoBreadcrumbs.xhr && 'fetch' in _window) {
            fill(_window, 'fetch', function(origFetch) {
                return function (fn, t) { // preserve arity
                    // Make a copy of the arguments to prevent deoptimization
                    // https://github.com/petkaantonov/bluebird/wiki/Optimization-killers#32-leaking-arguments
                    var args = new Array(arguments.length);
                    for(var i = 0; i < args.length; ++i) {
                        args[i] = arguments[i];
                    }

                    var method = 'GET';

                    if (args[1] && args[1].method) {
                        method = args[1].method;
                    }

                    var fetchData = {
                        method: method,
                        url: args[0],
                        status_code: null
                    };

                    self.captureBreadcrumb({
                        type: 'http',
                        category: 'fetch',
                        data: fetchData
                    });

                    return origFetch.apply(this, args).then(function (response) {
                        fetchData.status_code = response.status;

                        return response;
                    });
                };
            }, wrappedBuiltIns);
        }

        // Capture breadcrumbs from any click that is unhandled / bubbled up all the way
        // to the document. Do this before we instrument addEventListener.
        if (autoBreadcrumbs.dom && this._hasDocument) {
            if (_document.addEventListener) {
                _document.addEventListener('click', self._breadcrumbEventHandler('click'), false);
                _document.addEventListener('keypress', self._keypressEventHandler(), false);
            }
            else {
                // IE8 Compatibility
                _document.attachEvent('onclick', self._breadcrumbEventHandler('click'));
                _document.attachEvent('onkeypress', self._keypressEventHandler());
            }
        }

        // record navigation (URL) changes
        // NOTE: in Chrome App environment, touching history.pushState, *even inside
        //       a try/catch block*, will cause Chrome to output an error to console.error
        // borrowed from: https://github.com/angular/angular.js/pull/13945/files
        var chrome = _window.chrome;
        var isChromePackagedApp = chrome && chrome.app && chrome.app.runtime;
        var hasPushState = !isChromePackagedApp && _window.history && history.pushState;
        if (autoBreadcrumbs.location && hasPushState) {
            // TODO: remove onpopstate handler on uninstall()
            var oldOnPopState = _window.onpopstate;
            _window.onpopstate = function () {
                var currentHref = self._location.href;
                self._captureUrlChange(self._lastHref, currentHref);

                if (oldOnPopState) {
                    return oldOnPopState.apply(this, arguments);
                }
            };

            fill(history, 'pushState', function (origPushState) {
                // note history.pushState.length is 0; intentionally not declaring
                // params to preserve 0 arity
                return function (/* state, title, url */) {
                    var url = arguments.length > 2 ? arguments[2] : undefined;

                    // url argument is optional
                    if (url) {
                        // coerce to string (this is what pushState does)
                        self._captureUrlChange(self._lastHref, url + '');
                    }

                    return origPushState.apply(this, arguments);
                };
            }, wrappedBuiltIns);
        }

        if (autoBreadcrumbs.console && 'console' in _window && console.log) {
            // console
            var consoleMethodCallback = function (msg, data) {
                self.captureBreadcrumb({
                    message: msg,
                    level: data.level,
                    category: 'console'
                });
            };

            each(['debug', 'info', 'warn', 'error', 'log'], function (_, level) {
                wrapConsoleMethod(console, level, consoleMethodCallback);
            });
        }

    },

    _restoreBuiltIns: function () {
        // restore any wrapped builtins
        var builtin;
        while (this._wrappedBuiltIns.length) {
            builtin = this._wrappedBuiltIns.shift();

            var obj = builtin[0],
              name = builtin[1],
              orig = builtin[2];

            obj[name] = orig;
        }
    },

    _drainPlugins: function() {
        var self = this;

        // FIX ME TODO
        each(this._plugins, function(_, plugin) {
            var installer = plugin[0];
            var args = plugin[1];
            installer.apply(self, [self].concat(args));
        });
    },

    _parseDSN: function(str) {
        var m = dsnPattern.exec(str),
            dsn = {},
            i = 7;

        try {
            while (i--) dsn[dsnKeys[i]] = m[i] || '';
        } catch(e) {
            throw new RavenConfigError('Invalid DSN: ' + str);
        }

        if (dsn.pass && !this._globalOptions.allowSecretKey) {
            throw new RavenConfigError('Do not specify your secret key in the DSN. See: http://bit.ly/raven-secret-key');
        }

        return dsn;
    },

    _getGlobalServer: function(uri) {
        // assemble the endpoint from the uri pieces
        var globalServer = '//' + uri.host +
            (uri.port ? ':' + uri.port : '');

        if (uri.protocol) {
            globalServer = uri.protocol + ':' + globalServer;
        }
        return globalServer;
    },

    _handleOnErrorStackInfo: function() {
        // if we are intentionally ignoring errors via onerror, bail out
        if (!this._ignoreOnError) {
            this._handleStackInfo.apply(this, arguments);
        }
    },

    _handleStackInfo: function(stackInfo, options) {
        var frames = this._prepareFrames(stackInfo, options);

        this._triggerEvent('handle', {
            stackInfo: stackInfo,
            options: options
        });

        this._processException(
            stackInfo.name,
            stackInfo.message,
            stackInfo.url,
            stackInfo.lineno,
            frames,
            options
        );
    },

    _prepareFrames: function(stackInfo, options) {
        var self = this;
        var frames = [];
        if (stackInfo.stack && stackInfo.stack.length) {
            each(stackInfo.stack, function(i, stack) {
                var frame = self._normalizeFrame(stack);
                if (frame) {
                    frames.push(frame);
                }
            });

            // e.g. frames captured via captureMessage throw
            if (options && options.trimHeadFrames) {
                for (var j = 0; j < options.trimHeadFrames && j < frames.length; j++) {
                    frames[j].in_app = false;
                }
            }
        }
        frames = frames.slice(0, this._globalOptions.stackTraceLimit);
        return frames;
    },


    _normalizeFrame: function(frame) {
        if (!frame.url) return;

        // normalize the frames data
        var normalized = {
            filename:   frame.url,
            lineno:     frame.line,
            colno:      frame.column,
            'function': frame.func || '?'
        };

        normalized.in_app = !( // determine if an exception came from outside of our app
            // first we check the global includePaths list.
            !!this._globalOptions.includePaths.test && !this._globalOptions.includePaths.test(normalized.filename) ||
            // Now we check for fun, if the function name is Raven or TraceKit
            /(Raven|TraceKit)\./.test(normalized['function']) ||
            // finally, we do a last ditch effort and check for raven.min.js
            /raven\.(min\.)?js$/.test(normalized.filename)
        );

        return normalized;
    },

    _processException: function(type, message, fileurl, lineno, frames, options) {
        var stacktrace;
        if (!!this._globalOptions.ignoreErrors.test && this._globalOptions.ignoreErrors.test(message)) return;

        message += '';

        if (frames && frames.length) {
            fileurl = frames[0].filename || fileurl;
            // Sentry expects frames oldest to newest
            // and JS sends them as newest to oldest
            frames.reverse();
            stacktrace = {frames: frames};
        } else if (fileurl) {
            stacktrace = {
                frames: [{
                    filename: fileurl,
                    lineno: lineno,
                    in_app: true
                }]
            };
        }

        if (!!this._globalOptions.ignoreUrls.test && this._globalOptions.ignoreUrls.test(fileurl)) return;
        if (!!this._globalOptions.whitelistUrls.test && !this._globalOptions.whitelistUrls.test(fileurl)) return;

        var data = objectMerge({
            // sentry.interfaces.Exception
            exception: {
                values: [{
                    type: type,
                    value: message,
                    stacktrace: stacktrace
                }]
            },
            culprit: fileurl
        }, options);

        // Fire away!
        this._send(data);
    },

    _trimPacket: function(data) {
        // For now, we only want to truncate the two different messages
        // but this could/should be expanded to just trim everything
        var max = this._globalOptions.maxMessageLength;
        if (data.message) {
            data.message = truncate(data.message, max);
        }
        if (data.exception) {
            var exception = data.exception.values[0];
            exception.value = truncate(exception.value, max);
        }

        return data;
    },

    _getHttpData: function() {
        if (!this._hasDocument || !_document.location || !_document.location.href) {
            return;
        }

        var httpData = {
            headers: {
                'User-Agent': navigator.userAgent
            }
        };

        httpData.url = _document.location.href;

        if (_document.referrer) {
            httpData.headers.Referer = _document.referrer;
        }

        return httpData;
    },


    _send: function(data) {
        var globalOptions = this._globalOptions;

        var baseData = {
            project: this._globalProject,
            logger: globalOptions.logger,
            platform: 'javascript'
        }, httpData = this._getHttpData();

        if (httpData) {
            baseData.request = httpData;
        }

        // HACK: delete `trimHeadFrames` to prevent from appearing in outbound payload
        if (data.trimHeadFrames) delete data.trimHeadFrames;

        data = objectMerge(baseData, data);

        // Merge in the tags and extra separately since objectMerge doesn't handle a deep merge
        data.tags = objectMerge(objectMerge({}, this._globalContext.tags), data.tags);
        data.extra = objectMerge(objectMerge({}, this._globalContext.extra), data.extra);

        // Send along our own collected metadata with extra
        data.extra['session:duration'] = now() - this._startTime;

        if (this._breadcrumbs && this._breadcrumbs.length > 0) {
            // intentionally make shallow copy so that additions
            // to breadcrumbs aren't accidentally sent in this request
            data.breadcrumbs = {
                values: [].slice.call(this._breadcrumbs, 0)
            };
        }

        // If there are no tags/extra, strip the key from the payload alltogther.
        if (isEmptyObject(data.tags)) delete data.tags;

        if (this._globalContext.user) {
            // sentry.interfaces.User
            data.user = this._globalContext.user;
        }

        // Include the environment if it's defined in globalOptions
        if (globalOptions.environment) data.environment = globalOptions.environment;

        // Include the release if it's defined in globalOptions
        if (globalOptions.release) data.release = globalOptions.release;

        // Include server_name if it's defined in globalOptions
        if (globalOptions.serverName) data.server_name = globalOptions.serverName;

        if (isFunction(globalOptions.dataCallback)) {
            data = globalOptions.dataCallback(data) || data;
        }

        // Why??????????
        if (!data || isEmptyObject(data)) {
            return;
        }

        // Check if the request should be filtered or not
        if (isFunction(globalOptions.shouldSendCallback) && !globalOptions.shouldSendCallback(data)) {
            return;
        }

        this._sendProcessedPayload(data);
    },

    _getUuid: function () {
      return uuid4();
    },

    _sendProcessedPayload: function(data, callback) {
        var self = this;
        var globalOptions = this._globalOptions;

        // Send along an event_id if not explicitly passed.
        // This event_id can be used to reference the error within Sentry itself.
        // Set lastEventId after we know the error should actually be sent
        this._lastEventId = data.event_id || (data.event_id = this._getUuid());

        // Try and clean up the packet before sending by truncating long values
        data = this._trimPacket(data);

        this._logDebug('debug', 'Raven about to send:', data);

        if (!this.isSetup()) return;

        var auth = {
            sentry_version: '7',
            sentry_client: 'raven-js/' + this.VERSION,
            sentry_key: this._globalKey
        };
        if (this._globalSecret) {
            auth.sentry_secret = this._globalSecret;
        }

        var exception = data.exception && data.exception.values[0];
        this.captureBreadcrumb({
            category: 'sentry',
            message: exception
                ? (exception.type ? exception.type + ': ' : '') + exception.value
                : data.message,
            event_id: data.event_id,
            level: data.level || 'error' // presume error unless specified
        });

        var url = this._globalEndpoint;
        (globalOptions.transport || this._makeRequest).call(this, {
            url: url,
            auth: auth,
            data: data,
            options: globalOptions,
            onSuccess: function success() {
                self._triggerEvent('success', {
                    data: data,
                    src: url
                });
                callback && callback();
            },
            onError: function failure(error) {
                self._triggerEvent('failure', {
                    data: data,
                    src: url
                });
                error = error || new Error('Raven send failed (no additional details provided)');
                callback && callback(error);
            }
        });
    },

    _makeRequest: function(opts) {
        var request = new XMLHttpRequest();

        // if browser doesn't support CORS (e.g. IE7), we are out of luck
        var hasCORS =
            'withCredentials' in request ||
            typeof XDomainRequest !== 'undefined';

        if (!hasCORS) return;

        var url = opts.url;
        function handler() {
            if (request.status === 200) {
                if (opts.onSuccess) {
                    opts.onSuccess();
                }
            } else if (opts.onError) {
                opts.onError(new Error('Sentry error code: ' + request.status));
            }
        }

        if ('withCredentials' in request) {
            request.onreadystatechange = function () {
                if (request.readyState !== 4) {
                    return;
                }
                handler();
            };
        } else {
            request = new XDomainRequest();
            // xdomainrequest cannot go http -> https (or vice versa),
            // so always use protocol relative
            url = url.replace(/^https?:/, '');

            // onreadystatechange not supported by XDomainRequest
            request.onload = handler;
        }

        // NOTE: auth is intentionally sent as part of query string (NOT as custom
        //       HTTP header) so as to avoid preflight CORS requests
        request.open('POST', url + '?' + urlencode(opts.auth));
        request.send(stringify(opts.data));
    },

    _logDebug: function(level) {
        if (this._originalConsoleMethods[level] && this.debug) {
            // In IE<10 console methods do not have their own 'apply' method
            Function.prototype.apply.call(
                this._originalConsoleMethods[level],
                this._originalConsole,
                [].slice.call(arguments, 1)
            );
        }
    },

    _mergeContext: function(key, context) {
        if (isUndefined(context)) {
            delete this._globalContext[key];
        } else {
            this._globalContext[key] = objectMerge(this._globalContext[key] || {}, context);
        }
    }
};

/*------------------------------------------------
 * utils
 *
 * conditionally exported for test via Raven.utils
 =================================================
 */
var objectPrototype = Object.prototype;

function isUndefined(what) {
    return what === void 0;
}

function isFunction(what) {
    return typeof what === 'function';
}

function isString(what) {
    return objectPrototype.toString.call(what) === '[object String]';
}

function isObject(what) {
    return typeof what === 'object' && what !== null;
}

function isEmptyObject(what) {
    for (var _ in what) return false;  // eslint-disable-line guard-for-in, no-unused-vars
    return true;
}

// Sorta yanked from https://github.com/joyent/node/blob/aa3b4b4/lib/util.js#L560
// with some tiny modifications
function isError(what) {
    var toString = objectPrototype.toString.call(what);
    return isObject(what) &&
        toString === '[object Error]' ||
        toString === '[object Exception]' || // Firefox NS_ERROR_FAILURE Exceptions
        what instanceof Error;
}

function each(obj, callback) {
    var i, j;

    if (isUndefined(obj.length)) {
        for (i in obj) {
            if (hasKey(obj, i)) {
                callback.call(null, i, obj[i]);
            }
        }
    } else {
        j = obj.length;
        if (j) {
            for (i = 0; i < j; i++) {
                callback.call(null, i, obj[i]);
            }
        }
    }
}

function objectMerge(obj1, obj2) {
    if (!obj2) {
        return obj1;
    }
    each(obj2, function(key, value){
        obj1[key] = value;
    });
    return obj1;
}

function truncate(str, max) {
    return !max || str.length <= max ? str : str.substr(0, max) + '\u2026';
}

/**
 * hasKey, a better form of hasOwnProperty
 * Example: hasKey(MainHostObject, property) === true/false
 *
 * @param {Object} host object to check property
 * @param {string} key to check
 */
function hasKey(object, key) {
    return objectPrototype.hasOwnProperty.call(object, key);
}

function joinRegExp(patterns) {
    // Combine an array of regular expressions and strings into one large regexp
    // Be mad.
    var sources = [],
        i = 0, len = patterns.length,
        pattern;

    for (; i < len; i++) {
        pattern = patterns[i];
        if (isString(pattern)) {
            // If it's a string, we need to escape it
            // Taken from: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
            sources.push(pattern.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'));
        } else if (pattern && pattern.source) {
            // If it's a regexp already, we want to extract the source
            sources.push(pattern.source);
        }
        // Intentionally skip other cases
    }
    return new RegExp(sources.join('|'), 'i');
}

function urlencode(o) {
    var pairs = [];
    each(o, function(key, value) {
        pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return pairs.join('&');
}

// borrowed from https://tools.ietf.org/html/rfc3986#appendix-B
// intentionally using regex and not <a/> href parsing trick because React Native and other
// environments where DOM might not be available
function parseUrl(url) {
    var match = url.match(/^(([^:\/?#]+):)?(\/\/([^\/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/);
    if (!match) return {};

    // coerce to undefined values to empty string so we don't get 'undefined'
    var query = match[6] || '';
    var fragment = match[8] || '';
    return {
        protocol: match[2],
        host: match[4],
        path: match[5],
        relative: match[5] + query + fragment // everything minus origin
    };
}
function uuid4() {
    var crypto = window.crypto || window.msCrypto;

    if (!isUndefined(crypto) && crypto.getRandomValues) {
        // Use window.crypto API if available
        var arr = new Uint16Array(8);
        crypto.getRandomValues(arr);

        // set 4 in byte 7
        arr[3] = arr[3] & 0xFFF | 0x4000;
        // set 2 most significant bits of byte 9 to '10'
        arr[4] = arr[4] & 0x3FFF | 0x8000;

        var pad = function(num) {
            var v = num.toString(16);
            while (v.length < 4) {
                v = '0' + v;
            }
            return v;
        };

        return pad(arr[0]) + pad(arr[1]) + pad(arr[2]) + pad(arr[3]) + pad(arr[4]) +
        pad(arr[5]) + pad(arr[6]) + pad(arr[7]);
    } else {
        // http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/2117523#2117523
        return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random()*16|0,
                v = c === 'x' ? r : r&0x3|0x8;
            return v.toString(16);
        });
    }
}

/**
 * Given a child DOM element, returns a query-selector statement describing that
 * and its ancestors
 * e.g. [HTMLElement] => body > div > input#foo.btn[name=baz]
 * @param elem
 * @returns {string}
 */
function htmlTreeAsString(elem) {
    /* eslint no-extra-parens:0*/
    var MAX_TRAVERSE_HEIGHT = 5,
        MAX_OUTPUT_LEN = 80,
        out = [],
        height = 0,
        len = 0,
        separator = ' > ',
        sepLength = separator.length,
        nextStr;

    while (elem && height++ < MAX_TRAVERSE_HEIGHT) {

        nextStr = htmlElementAsString(elem);
        // bail out if
        // - nextStr is the 'html' element
        // - the length of the string that would be created exceeds MAX_OUTPUT_LEN
        //   (ignore this limit if we are on the first iteration)
        if (nextStr === 'html' || height > 1 && len + (out.length * sepLength) + nextStr.length >= MAX_OUTPUT_LEN) {
            break;
        }

        out.push(nextStr);

        len += nextStr.length;
        elem = elem.parentNode;
    }

    return out.reverse().join(separator);
}

/**
 * Returns a simple, query-selector representation of a DOM element
 * e.g. [HTMLElement] => input#foo.btn[name=baz]
 * @param HTMLElement
 * @returns {string}
 */
function htmlElementAsString(elem) {
    var out = [],
        className,
        classes,
        key,
        attr,
        i;

    if (!elem || !elem.tagName) {
        return '';
    }

    out.push(elem.tagName.toLowerCase());
    if (elem.id) {
        out.push('#' + elem.id);
    }

    className = elem.className;
    if (className && isString(className)) {
        classes = className.split(' ');
        for (i = 0; i < classes.length; i++) {
            out.push('.' + classes[i]);
        }
    }
    var attrWhitelist = ['type', 'name', 'title', 'alt'];
    for (i = 0; i < attrWhitelist.length; i++) {
        key = attrWhitelist[i];
        attr = elem.getAttribute(key);
        if (attr) {
            out.push('[' + key + '="' + attr + '"]');
        }
    }
    return out.join('');
}

/**
 * Polyfill a method
 * @param obj object e.g. `document`
 * @param name method name present on object e.g. `addEventListener`
 * @param replacement replacement function
 * @param track {optional} record instrumentation to an array
 */
function fill(obj, name, replacement, track) {
    var orig = obj[name];
    obj[name] = replacement(orig);
    if (track) {
        track.push([obj, name, orig]);
    }
}

if (typeof __DEV__ !== 'undefined' && __DEV__) {
    Raven.utils = {
        isUndefined: isUndefined,
        isFunction: isFunction,
        isString: isString,
        isObject: isObject,
        isEmptyObject: isEmptyObject,
        isError: isError,
        each: each,
        objectMerge: objectMerge,
        truncate: truncate,
        hasKey: hasKey,
        joinRegExp: joinRegExp,
        urlencode: urlencode,
        uuid4: uuid4,
        htmlTreeAsString: htmlTreeAsString,
        htmlElementAsString: htmlElementAsString,
        parseUrl: parseUrl,
        fill: fill
    };
};

// Deprecations
Raven.prototype.setUser = Raven.prototype.setUserContext;
Raven.prototype.setReleaseContext = Raven.prototype.setRelease;

module.exports = Raven;

},{"1":1,"2":2,"3":3,"6":6}],5:[function(_dereq_,module,exports){
/**
 * Enforces a single instance of the Raven client, and the
 * main entry point for Raven. If you are a consumer of the
 * Raven library, you SHOULD load this file (vs raven.js).
 **/

'use strict';

var RavenConstructor = _dereq_(4);

var _Raven = window.Raven;

var Raven = new RavenConstructor();

/*
 * Allow multiple versions of Raven to be installed.
 * Strip Raven from the global context and returns the instance.
 *
 * @return {Raven}
 */
Raven.noConflict = function () {
	window.Raven = _Raven;
	return Raven;
};

Raven.afterLoad();

module.exports = Raven;

},{"4":4}],6:[function(_dereq_,module,exports){
'use strict';

/*
 TraceKit - Cross brower stack traces - github.com/occ/TraceKit
 MIT license
*/

var TraceKit = {
    collectWindowErrors: true,
    debug: false
};

// global reference to slice
var _slice = [].slice;
var UNKNOWN_FUNCTION = '?';

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Error_types
var ERROR_TYPES_RE = /^(?:Uncaught (?:exception: )?)?((?:Eval|Internal|Range|Reference|Syntax|Type|URI)Error): ?(.*)$/;

function getLocationHref() {
    if (typeof document === 'undefined')
        return '';

    return document.location.href;
}

/**
 * TraceKit.report: cross-browser processing of unhandled exceptions
 *
 * Syntax:
 *   TraceKit.report.subscribe(function(stackInfo) { ... })
 *   TraceKit.report.unsubscribe(function(stackInfo) { ... })
 *   TraceKit.report(exception)
 *   try { ...code... } catch(ex) { TraceKit.report(ex); }
 *
 * Supports:
 *   - Firefox: full stack trace with line numbers, plus column number
 *              on top frame; column number is not guaranteed
 *   - Opera:   full stack trace with line and column numbers
 *   - Chrome:  full stack trace with line and column numbers
 *   - Safari:  line and column number for the top frame only; some frames
 *              may be missing, and column number is not guaranteed
 *   - IE:      line and column number for the top frame only; some frames
 *              may be missing, and column number is not guaranteed
 *
 * In theory, TraceKit should work on all of the following versions:
 *   - IE5.5+ (only 8.0 tested)
 *   - Firefox 0.9+ (only 3.5+ tested)
 *   - Opera 7+ (only 10.50 tested; versions 9 and earlier may require
 *     Exceptions Have Stacktrace to be enabled in opera:config)
 *   - Safari 3+ (only 4+ tested)
 *   - Chrome 1+ (only 5+ tested)
 *   - Konqueror 3.5+ (untested)
 *
 * Requires TraceKit.computeStackTrace.
 *
 * Tries to catch all unhandled exceptions and report them to the
 * subscribed handlers. Please note that TraceKit.report will rethrow the
 * exception. This is REQUIRED in order to get a useful stack trace in IE.
 * If the exception does not reach the top of the browser, you will only
 * get a stack trace from the point where TraceKit.report was called.
 *
 * Handlers receive a stackInfo object as described in the
 * TraceKit.computeStackTrace docs.
 */
TraceKit.report = (function reportModuleWrapper() {
    var handlers = [],
        lastArgs = null,
        lastException = null,
        lastExceptionStack = null;

    /**
     * Add a crash handler.
     * @param {Function} handler
     */
    function subscribe(handler) {
        installGlobalHandler();
        handlers.push(handler);
    }

    /**
     * Remove a crash handler.
     * @param {Function} handler
     */
    function unsubscribe(handler) {
        for (var i = handlers.length - 1; i >= 0; --i) {
            if (handlers[i] === handler) {
                handlers.splice(i, 1);
            }
        }
    }

    /**
     * Remove all crash handlers.
     */
    function unsubscribeAll() {
        uninstallGlobalHandler();
        handlers = [];
    }

    /**
     * Dispatch stack information to all handlers.
     * @param {Object.<string, *>} stack
     */
    function notifyHandlers(stack, isWindowError) {
        var exception = null;
        if (isWindowError && !TraceKit.collectWindowErrors) {
          return;
        }
        for (var i in handlers) {
            if (handlers.hasOwnProperty(i)) {
                try {
                    handlers[i].apply(null, [stack].concat(_slice.call(arguments, 2)));
                } catch (inner) {
                    exception = inner;
                }
            }
        }

        if (exception) {
            throw exception;
        }
    }

    var _oldOnerrorHandler, _onErrorHandlerInstalled;

    /**
     * Ensures all global unhandled exceptions are recorded.
     * Supported by Gecko and IE.
     * @param {string} message Error message.
     * @param {string} url URL of script that generated the exception.
     * @param {(number|string)} lineNo The line number at which the error
     * occurred.
     * @param {?(number|string)} colNo The column number at which the error
     * occurred.
     * @param {?Error} ex The actual Error object.
     */
    function traceKitWindowOnError(message, url, lineNo, colNo, ex) {
        var stack = null;

        if (lastExceptionStack) {
            TraceKit.computeStackTrace.augmentStackTraceWithInitialElement(lastExceptionStack, url, lineNo, message);
            processLastException();
        } else if (ex) {
            // New chrome and blink send along a real error object
            // Let's just report that like a normal error.
            // See: https://mikewest.org/2013/08/debugging-runtime-errors-with-window-onerror
            stack = TraceKit.computeStackTrace(ex);
            notifyHandlers(stack, true);
        } else {
            var location = {
                'url': url,
                'line': lineNo,
                'column': colNo
            };

            var name = undefined;
            var msg = message; // must be new var or will modify original `arguments`
            var groups;
            if ({}.toString.call(message) === '[object String]') {
                var groups = message.match(ERROR_TYPES_RE);
                if (groups) {
                    name = groups[1];
                    msg = groups[2];
                }
            }

            location.func = UNKNOWN_FUNCTION;

            stack = {
                'name': name,
                'message': msg,
                'url': getLocationHref(),
                'stack': [location]
            };
            notifyHandlers(stack, true);
        }

        if (_oldOnerrorHandler) {
            return _oldOnerrorHandler.apply(this, arguments);
        }

        return false;
    }

    function installGlobalHandler ()
    {
        if (_onErrorHandlerInstalled) {
            return;
        }
        _oldOnerrorHandler = window.onerror;
        window.onerror = traceKitWindowOnError;
        _onErrorHandlerInstalled = true;
    }

    function uninstallGlobalHandler ()
    {
        if (!_onErrorHandlerInstalled) {
            return;
        }
        window.onerror = _oldOnerrorHandler;
        _onErrorHandlerInstalled = false;
        _oldOnerrorHandler = undefined;
    }

    function processLastException() {
        var _lastExceptionStack = lastExceptionStack,
            _lastArgs = lastArgs;
        lastArgs = null;
        lastExceptionStack = null;
        lastException = null;
        notifyHandlers.apply(null, [_lastExceptionStack, false].concat(_lastArgs));
    }

    /**
     * Reports an unhandled Error to TraceKit.
     * @param {Error} ex
     * @param {?boolean} rethrow If false, do not re-throw the exception.
     * Only used for window.onerror to not cause an infinite loop of
     * rethrowing.
     */
    function report(ex, rethrow) {
        var args = _slice.call(arguments, 1);
        if (lastExceptionStack) {
            if (lastException === ex) {
                return; // already caught by an inner catch block, ignore
            } else {
              processLastException();
            }
        }

        var stack = TraceKit.computeStackTrace(ex);
        lastExceptionStack = stack;
        lastException = ex;
        lastArgs = args;

        // If the stack trace is incomplete, wait for 2 seconds for
        // slow slow IE to see if onerror occurs or not before reporting
        // this exception; otherwise, we will end up with an incomplete
        // stack trace
        setTimeout(function () {
            if (lastException === ex) {
                processLastException();
            }
        }, (stack.incomplete ? 2000 : 0));

        if (rethrow !== false) {
            throw ex; // re-throw to propagate to the top level (and cause window.onerror)
        }
    }

    report.subscribe = subscribe;
    report.unsubscribe = unsubscribe;
    report.uninstall = unsubscribeAll;
    return report;
}());

/**
 * TraceKit.computeStackTrace: cross-browser stack traces in JavaScript
 *
 * Syntax:
 *   s = TraceKit.computeStackTrace(exception) // consider using TraceKit.report instead (see below)
 * Returns:
 *   s.name              - exception name
 *   s.message           - exception message
 *   s.stack[i].url      - JavaScript or HTML file URL
 *   s.stack[i].func     - function name, or empty for anonymous functions (if guessing did not work)
 *   s.stack[i].args     - arguments passed to the function, if known
 *   s.stack[i].line     - line number, if known
 *   s.stack[i].column   - column number, if known
 *
 * Supports:
 *   - Firefox:  full stack trace with line numbers and unreliable column
 *               number on top frame
 *   - Opera 10: full stack trace with line and column numbers
 *   - Opera 9-: full stack trace with line numbers
 *   - Chrome:   full stack trace with line and column numbers
 *   - Safari:   line and column number for the topmost stacktrace element
 *               only
 *   - IE:       no line numbers whatsoever
 *
 * Tries to guess names of anonymous functions by looking for assignments
 * in the source code. In IE and Safari, we have to guess source file names
 * by searching for function bodies inside all page scripts. This will not
 * work for scripts that are loaded cross-domain.
 * Here be dragons: some function names may be guessed incorrectly, and
 * duplicate functions may be mismatched.
 *
 * TraceKit.computeStackTrace should only be used for tracing purposes.
 * Logging of unhandled exceptions should be done with TraceKit.report,
 * which builds on top of TraceKit.computeStackTrace and provides better
 * IE support by utilizing the window.onerror event to retrieve information
 * about the top of the stack.
 *
 * Note: In IE and Safari, no stack trace is recorded on the Error object,
 * so computeStackTrace instead walks its *own* chain of callers.
 * This means that:
 *  * in Safari, some methods may be missing from the stack trace;
 *  * in IE, the topmost function in the stack trace will always be the
 *    caller of computeStackTrace.
 *
 * This is okay for tracing (because you are likely to be calling
 * computeStackTrace from the function you want to be the topmost element
 * of the stack trace anyway), but not okay for logging unhandled
 * exceptions (because your catch block will likely be far away from the
 * inner function that actually caused the exception).
 *
 */
TraceKit.computeStackTrace = (function computeStackTraceWrapper() {
    /**
     * Escapes special characters, except for whitespace, in a string to be
     * used inside a regular expression as a string literal.
     * @param {string} text The string.
     * @return {string} The escaped string literal.
     */
    function escapeRegExp(text) {
        return text.replace(/[\-\[\]{}()*+?.,\\\^$|#]/g, '\\$&');
    }

    /**
     * Escapes special characters in a string to be used inside a regular
     * expression as a string literal. Also ensures that HTML entities will
     * be matched the same as their literal friends.
     * @param {string} body The string.
     * @return {string} The escaped string.
     */
    function escapeCodeAsRegExpForMatchingInsideHTML(body) {
        return escapeRegExp(body).replace('<', '(?:<|&lt;)').replace('>', '(?:>|&gt;)').replace('&', '(?:&|&amp;)').replace('"', '(?:"|&quot;)').replace(/\s+/g, '\\s+');
    }

    // Contents of Exception in various browsers.
    //
    // SAFARI:
    // ex.message = Can't find variable: qq
    // ex.line = 59
    // ex.sourceId = 580238192
    // ex.sourceURL = http://...
    // ex.expressionBeginOffset = 96
    // ex.expressionCaretOffset = 98
    // ex.expressionEndOffset = 98
    // ex.name = ReferenceError
    //
    // FIREFOX:
    // ex.message = qq is not defined
    // ex.fileName = http://...
    // ex.lineNumber = 59
    // ex.columnNumber = 69
    // ex.stack = ...stack trace... (see the example below)
    // ex.name = ReferenceError
    //
    // CHROME:
    // ex.message = qq is not defined
    // ex.name = ReferenceError
    // ex.type = not_defined
    // ex.arguments = ['aa']
    // ex.stack = ...stack trace...
    //
    // INTERNET EXPLORER:
    // ex.message = ...
    // ex.name = ReferenceError
    //
    // OPERA:
    // ex.message = ...message... (see the example below)
    // ex.name = ReferenceError
    // ex.opera#sourceloc = 11  (pretty much useless, duplicates the info in ex.message)
    // ex.stacktrace = n/a; see 'opera:config#UserPrefs|Exceptions Have Stacktrace'

    /**
     * Computes stack trace information from the stack property.
     * Chrome and Gecko use this property.
     * @param {Error} ex
     * @return {?Object.<string, *>} Stack trace information.
     */
    function computeStackTraceFromStackProp(ex) {
        if (typeof ex.stack === 'undefined' || !ex.stack) return;

        var chrome = /^\s*at (.*?) ?\(((?:file|https?|blob|chrome-extension|native|eval|<anonymous>).*?)(?::(\d+))?(?::(\d+))?\)?\s*$/i,
            gecko = /^\s*(.*?)(?:\((.*?)\))?(?:^|@)((?:file|https?|blob|chrome|\[native).*?)(?::(\d+))?(?::(\d+))?\s*$/i,
            winjs = /^\s*at (?:((?:\[object object\])?.+) )?\(?((?:file|ms-appx|https?|blob):.*?):(\d+)(?::(\d+))?\)?\s*$/i,
            lines = ex.stack.split('\n'),
            stack = [],
            parts,
            element,
            reference = /^(.*) is undefined$/.exec(ex.message);

        for (var i = 0, j = lines.length; i < j; ++i) {
            if ((parts = chrome.exec(lines[i]))) {
                var isNative = parts[2] && parts[2].indexOf('native') !== -1;
                element = {
                    'url': !isNative ? parts[2] : null,
                    'func': parts[1] || UNKNOWN_FUNCTION,
                    'args': isNative ? [parts[2]] : [],
                    'line': parts[3] ? +parts[3] : null,
                    'column': parts[4] ? +parts[4] : null
                };
            } else if ( parts = winjs.exec(lines[i]) ) {
                element = {
                    'url': parts[2],
                    'func': parts[1] || UNKNOWN_FUNCTION,
                    'args': [],
                    'line': +parts[3],
                    'column': parts[4] ? +parts[4] : null
                };
            } else if ((parts = gecko.exec(lines[i]))) {
                element = {
                    'url': parts[3],
                    'func': parts[1] || UNKNOWN_FUNCTION,
                    'args': parts[2] ? parts[2].split(',') : [],
                    'line': parts[4] ? +parts[4] : null,
                    'column': parts[5] ? +parts[5] : null
                };
            } else {
                continue;
            }

            if (!element.func && element.line) {
                element.func = UNKNOWN_FUNCTION;
            }

            stack.push(element);
        }

        if (!stack.length) {
            return null;
        }

        if (!stack[0].column && typeof ex.columnNumber !== 'undefined') {
            // FireFox uses this awesome columnNumber property for its top frame
            // Also note, Firefox's column number is 0-based and everything else expects 1-based,
            // so adding 1
            stack[0].column = ex.columnNumber + 1;
        }

        return {
            'name': ex.name,
            'message': ex.message,
            'url': getLocationHref(),
            'stack': stack
        };
    }

    /**
     * Adds information about the first frame to incomplete stack traces.
     * Safari and IE require this to get complete data on the first frame.
     * @param {Object.<string, *>} stackInfo Stack trace information from
     * one of the compute* methods.
     * @param {string} url The URL of the script that caused an error.
     * @param {(number|string)} lineNo The line number of the script that
     * caused an error.
     * @param {string=} message The error generated by the browser, which
     * hopefully contains the name of the object that caused the error.
     * @return {boolean} Whether or not the stack information was
     * augmented.
     */
    function augmentStackTraceWithInitialElement(stackInfo, url, lineNo, message) {
        var initial = {
            'url': url,
            'line': lineNo
        };

        if (initial.url && initial.line) {
            stackInfo.incomplete = false;

            if (!initial.func) {
                initial.func = UNKNOWN_FUNCTION;
            }

            if (stackInfo.stack.length > 0) {
                if (stackInfo.stack[0].url === initial.url) {
                    if (stackInfo.stack[0].line === initial.line) {
                        return false; // already in stack trace
                    } else if (!stackInfo.stack[0].line && stackInfo.stack[0].func === initial.func) {
                        stackInfo.stack[0].line = initial.line;
                        return false;
                    }
                }
            }

            stackInfo.stack.unshift(initial);
            stackInfo.partial = true;
            return true;
        } else {
            stackInfo.incomplete = true;
        }

        return false;
    }

    /**
     * Computes stack trace information by walking the arguments.caller
     * chain at the time the exception occurred. This will cause earlier
     * frames to be missed but is the only way to get any stack trace in
     * Safari and IE. The top frame is restored by
     * {@link augmentStackTraceWithInitialElement}.
     * @param {Error} ex
     * @return {?Object.<string, *>} Stack trace information.
     */
    function computeStackTraceByWalkingCallerChain(ex, depth) {
        var functionName = /function\s+([_$a-zA-Z\xA0-\uFFFF][_$a-zA-Z0-9\xA0-\uFFFF]*)?\s*\(/i,
            stack = [],
            funcs = {},
            recursion = false,
            parts,
            item,
            source;

        for (var curr = computeStackTraceByWalkingCallerChain.caller; curr && !recursion; curr = curr.caller) {
            if (curr === computeStackTrace || curr === TraceKit.report) {
                // console.log('skipping internal function');
                continue;
            }

            item = {
                'url': null,
                'func': UNKNOWN_FUNCTION,
                'line': null,
                'column': null
            };

            if (curr.name) {
                item.func = curr.name;
            } else if ((parts = functionName.exec(curr.toString()))) {
                item.func = parts[1];
            }

            if (typeof item.func === 'undefined') {
              try {
                item.func = parts.input.substring(0, parts.input.indexOf('{'));
              } catch (e) { }
            }

            if (funcs['' + curr]) {
                recursion = true;
            }else{
                funcs['' + curr] = true;
            }

            stack.push(item);
        }

        if (depth) {
            // console.log('depth is ' + depth);
            // console.log('stack is ' + stack.length);
            stack.splice(0, depth);
        }

        var result = {
            'name': ex.name,
            'message': ex.message,
            'url': getLocationHref(),
            'stack': stack
        };
        augmentStackTraceWithInitialElement(result, ex.sourceURL || ex.fileName, ex.line || ex.lineNumber, ex.message || ex.description);
        return result;
    }

    /**
     * Computes a stack trace for an exception.
     * @param {Error} ex
     * @param {(string|number)=} depth
     */
    function computeStackTrace(ex, depth) {
        var stack = null;
        depth = (depth == null ? 0 : +depth);

        try {
            stack = computeStackTraceFromStackProp(ex);
            if (stack) {
                return stack;
            }
        } catch (e) {
            if (TraceKit.debug) {
                throw e;
            }
        }

        try {
            stack = computeStackTraceByWalkingCallerChain(ex, depth + 1);
            if (stack) {
                return stack;
            }
        } catch (e) {
            if (TraceKit.debug) {
                throw e;
            }
        }

        return {
            'name': ex.name,
            'message': ex.message,
            'url': getLocationHref()
        };
    }

    computeStackTrace.augmentStackTraceWithInitialElement = augmentStackTraceWithInitialElement;
    computeStackTrace.computeStackTraceFromStackProp = computeStackTraceFromStackProp;

    return computeStackTrace;
}());

module.exports = TraceKit;

},{}]},{},[5])(5)
});
(function() {
    var widget_iframes = {};
    var lightbox_iframe;
    var uploader_iframe;
    var social_auth_iframe;
    var variableName = "";

    //prevent multiple includes from messing things up
    if ('Pixlee' in window && window.Pixlee.rootRoute !== 'dashboard') {
        return false;
    }
 
    //this file always comes first for us so window.pixRaven can't already exist. Create a new instance and store it as
    //pixRaven on the window so that it can be shared by our other embedded scripts
    if (typeof Raven !== 'undefined' && typeof window.pixRaven === 'undefined') {
        window.pixRaven = Raven.noConflict();

        window.pixRaven.config('https://b5f591e9229248c8a39eb935efa31a27@sentry.io/12047', {
            ignoreUrls: [/pdp\.dev/, /widget\.dev/, /codepen/],
            ignoreErrors: [/Permission denied/]
        });
    }

    // Custom error type used when throwing internally
    var ManagedError = function(message) {
        Error.prototype.constructor.apply(this, arguments);
        this.message = message;
    };
    ManagedError.prototype = new Error();

    /**
     * Wraps a function so that it will never throw and bubble
     */
    function unguard(fn) {
        return function() {
            try {
                return fn.apply(this, arguments);
            } catch (e) {
                // surface the error
                // console.log(' - bubbling error to window.onerror');
                setTimeout(function() {
                    throw e;
                }, 0);
            }
        };
    }
    var guid = (function() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return function() {
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
                s4() + '-' + s4() + s4() + s4();
        };
    })();

    var isWidgetVisible = function(IframeNode) {
        if (!IframeNode) {
            return;
        }

        var widgetFrame = IframeNode;
        var vpWidth = window.innerWidth;
        var vpHeight = window.innerHeight;

        // Use this native browser method, if available.
        if (typeof widgetFrame.getBoundingClientRect === 'function') {
            var rec = widgetFrame.getBoundingClientRect();
            var tViz = rec.top >= 0 && rec.top < vpHeight;
            var bViz = rec.bottom > 0 && rec.bottom <= vpHeight;
            var lViz = rec.left >= 0 && rec.left < vpWidth;
            var rViz = rec.right > 0 && rec.right <= vpWidth;

            // debugger;
            var vVisible = tViz || bViz;
            var hVisible = lViz || rViz;

            return vVisible && hVisible;
        } else {
            //cross browser compatible offset calculations
            var viewTop = (window.pageYOffset !== undefined) ? window.pageYOffset : (document.documentElement || document.body.parentNode || document.body).scrollTop;
            var viewLeft = (window.pageXOffset !== undefined) ? window.pageXOffset : (document.documentElement || document.body.parentNode || document.body).scrollLeft;

            //simple math to get the bottom and right
            var viewBottom = viewTop + vpHeight;
            var viewRight = viewLeft + vpWidth;

            //get our final values
            var _top = widgetFrame.offsetTop;
            var _left = widgetFrame.offsetLeft;
            var _bottom = _top + widgetFrame.clientHeight;
            var _right = _left + widgetFrame.clientWidth;

            //check 'em
            return ((_top <= viewBottom) && (_bottom >= viewTop)) && ((_left <= viewRight) && (_right >= viewLeft));

        }
    };

    // Helper function for wrapping all functions

    function wrap(fn, value) {
        // not all 'function's are actually functions!
        if (typeof value === 'function' && /^function/.test(value.toString())) {
            return fn(value);
        } else if (typeof value === 'object' && value !== null) {
            for (var key in value)
                if (value.hasOwnProperty(key)) {
                    value[key] = wrap(fn, value[key]);
                }
        }
        return value;
    }

    /**
     * Wraps a function so that any error thrown is reported.
     * ManagedError's are disregarded and rethrown.
     */

    function guard(fn) {
        return function() {
            // capture the arguments and unguard any functions
            var args = Array.prototype.slice.call(arguments).map(wrap.bind(null, unguard));

            try {
                return wrap(guard, fn.apply(this, args));
            } catch (e) {
                // If this is a ManagedError, then this is something that we want to
                // surface without logging it
                if (e instanceof ManagedError) {
                    // console.log(' - Managed error: re-throw', e);
                    throw e;
                }
                // log error
                // console.log(' - Unmanaged error: log and re-throw', e);
                throw e;
            }
        };
    }

    function mobileCheck() {
        var isMobile = false;
        (function(a) {
            if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a) || /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0, 4))) {
                isMobile = true;
            }
        })(navigator.userAgent || navigator.vendor || window.opera);
        return isMobile;
    }

    function tabletCheck() {
        var isTablet = false;
        (function(a) {
            if (/(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(a)) {
                isTablet = true;
            }
        })(navigator.userAgent || navigator.vendor || window.opera);
        return isTablet;
    }

    function iOSSafariCheck() {
        var isIOSSafari = false;
        (function(a) {
            var iOS = !!a.match(/iPad/i) || !!a.match(/iPhone/i);
            var webkit = !!a.match(/WebKit/i);
            var iOSSafari = iOS && webkit && !a.match(/CriOS/i);
            if (iOSSafari) {
                isIOSSafari = true;
            }
        })(navigator.userAgent || navigator.vendor || window.opera);
        return isIOSSafari;
    }

    //remove the flicker-preventing background
    function removeFlickerScreen() {
        var tempBackground = document.getElementById('flickerBackground');
        if (tempBackground) {
            document.body.removeChild(tempBackground);
        }
    }

    //create a temporary white background to prevent the scrolling from causing a visual flicker
    function createFlickerScreen() {
        var tempBackground = document.getElementById('flickerBackground');
        if (!tempBackground) {
            tempBackground = document.createElement('div');
            tempBackground.setAttribute('id', 'flickerBackground');
            tempBackground.setAttribute('style', 'height:100%; width:100%; position:fixed; top:0; left:0; opacity:1; z-index:9999; background-color:white;');
            document.body.appendChild(tempBackground);
        }
    }

    function resizeWidget(fixedWidth) {
        var isOldIE = (navigator.userAgent.indexOf("MSIE") !== -1); // Detect IE10 and below
        var isNewIE = (!!window.MSInputMethodContext && !!document.documentMode); //hack to detect IE11
        //default height calculation to prevent flickering in <IE10 and no width resize on IE11 to prevent shrinking
        if (isOldIE || isNewIE) {
            iFrameResize({
                log: false, // Enable console logging
                enablePublicMethods: true, // Enable methods within iframe hosted page
                resizedCallback: _api.onResize,
                checkOrigin: false
            }, 'iframe[id*=pixlee]');
        } else {
            iFrameResize({
                log: false, // Enable console logging
                enablePublicMethods: true, // Enable methods within iframe hosted page
                resizedCallback: _api.onResize,
                heightCalculationMethod: 'min',
                checkOrigin: false,
                sizeWidth: fixedWidth ? false : true // if they requested fixedWidth, don't resize on width
            }, 'iframe[id*=pixlee]');
        }
    }

    var _api = {
        provide: function(name, fn) {
            this[name] = guard(fn);
        },
        onResize: function(options) {
            if (options.iframe.style.visibility) {
                options.iframe.style.visibility = "";
            }

            //http://stackoverflow.com/questions/23083462/how-to-get-an-iframe-to-be-responsive-in-ios-safari
            if (options.iframe.width === '1px') {
                options.iframe.style.minWidth = '100%';
            }
        },
        defaults: {
            containerId: "pixlee_container",
            setMetaTags: false,
            rootUrl: "https://instafeed.pixlee.com/widget",
            uploaderUrl: "https://instafeed.pixlee.com/uploader",
            lightboxRootUrl: "https://instafeed.pixlee.com/lightbox",
            socialAuthUrl: "https://instafeed.pixlee.com/social_auth",
            iframeId: "pixlee_widget_iframe",
            lightboxId: "pixlee_lightbox_iframe",
            uploaderId: "pixlee_uploader",
            socialAuthId: "pixlee_social_auth",
            atcFrameId: "pixlee_add_to_cart_frame"
        },
        scrollLeftPosition: 0,
        scrollTopPosition: 0
    };

    _api.provide('getCookie', function(c_name) {
        var i, x, y, ARRcookies = document.cookie.split(";");

        for (i = 0; i < ARRcookies.length; i++) {
            x = ARRcookies[i].substr(0, ARRcookies[i].indexOf("="));
            y = ARRcookies[i].substr(ARRcookies[i].indexOf("=") + 1);
            x = x.replace(/^\s+|\s+$/g, "");
            if (x == c_name) {
                var cook = JSON.parse(decodeURIComponent(y));
                return cook;
            }
        }
        return false;
    });
    _api.provide('addParam', function(url, param, value) {
        var a = document.createElement('a'),
            regex = /[?&]([^=]+)=([^&]*)/g;
        var params = {},
            match, str = [];
        a.href = url;
        value = value || "";
        while (match = regex.exec(a.search))
            if (param != match[1]) str.push(match[1] + "=" + match[2]);
        str.push(encodeURIComponent(param) + "=" + encodeURIComponent(value));
        a.search = (a.search.substring(0, 1) == "?" ? "" : "?") + str.join("&");
        return a.href;
    });
    _api.provide('setCookie', function(c_name, value, exdays) {
        var exdate = new Date();
        exdate.setDate(exdate.getDate() + exdays);
        var c_value = encodeURIComponent(JSON.stringify(value)) +
            ((exdays == null) ? "" : ("; expires=" + exdate.toUTCString())) + ';' + ' path=/; domain=' + window.location.host.replace('www', '');
        document.cookie = c_name + "=" + c_value;
    });


    _api.provide('getParameterByName', function(name, url) {
        name = name.replace(/[\[]/, '\\\[').replace(/[\]]/, '\\\]');
        var regex = new RegExp('[\\?&]' + name + '=([^&#]*)'),
            results = regex.exec(url);
        return results == null ? null : decodeURIComponent(results[1].replace(/\+/g, ' '));
    });
    _api.provide('removeParam', function(key, sourceURL) {
        var rtn = sourceURL.split("?")[0],
            param,
            params_arr = [],
            queryString = (sourceURL.indexOf("?") !== -1) ? sourceURL.split("?")[1] : "";
        if (queryString !== "") {
            params_arr = queryString.split("&");
            for (var i = params_arr.length - 1; i >= 0; i -= 1) {
                param = params_arr[i].split("=")[0];
                if (param === key) {
                    params_arr.splice(i, 1);
                }
            }
            if (params_arr.length > 0) {
                rtn = rtn + "?" + params_arr.join("&");
            }
        }
        return rtn;
    });
    _api.provide('changeUrl', function(url) {
        if (history.replaceState && window.location.href != url) {
            window.history.replaceState({
                path: url
            }, '', url);
        }
    });
    _api.provide("iframeErrorHandler", function(error) {
        document.getElementById('myIFrame').style.display = 'none';
        console.error('Error loading iframe contents: ' + error);
        return true;
    });
    _api.provide('updateURLParameter', function(url, param, paramVal) {
        var TheAnchor = null;
        var newAdditionalURL = "";
        var tempArray = url.split("?");
        var baseURL = tempArray[0];
        var additionalURL = tempArray[1];
        var temp = "";

        if (additionalURL) {
            var tmpAnchor = additionalURL.split("#");
            var TheParams = tmpAnchor[0];
            TheAnchor = tmpAnchor[1];
            if (TheAnchor)
                additionalURL = TheParams;

            tempArray = additionalURL.split("&");

            for (i = 0; i < tempArray.length; i++) {
                if (tempArray[i].split('=')[0] != param) {
                    newAdditionalURL += temp + tempArray[i];
                    temp = "&";
                }
            }
        } else {
            var tmpAnchor = baseURL.split("#");
            var TheParams = tmpAnchor[0];
            TheAnchor = tmpAnchor[1];

            if (TheParams)
                baseURL = TheParams;
        }

        if (TheAnchor)
            paramVal += "#" + TheAnchor;

        var rows_txt = temp + "" + param + "=" + paramVal;
        return baseURL + "?" + newAdditionalURL + rows_txt;
    });

    _api.provide('createLightboxContainer', function(options, photo_id) {
        if (typeof options.lightbox !== 'undefined' && !options.lightbox) {
            return;
        }
        //create the lightbox Iframe
        if (!document.querySelector("#" + _api.defaults.lightboxId)) {
            var lightboxIframe = document.createElement("iframe");
            lightboxIframe.id = _api.defaults.lightboxId;
            lightboxIframe.width = '100%';
            lightboxIframe.height = '100%';
            lightboxIframe.style.top = '0';
            lightboxIframe.style.left = '0';
            lightboxIframe.title = 'Shop customer photos with Pixlee';
            lightboxIframe.style.bottom = '0';
            lightboxIframe.style.right = '0';
            lightboxIframe.style.title = 'Browse Instagram Gallery powered by Pixlee';
            lightboxIframe.style.padding = 0;
            lightboxIframe.style.margin = 0;
            lightboxIframe.style.position = 'fixed';
            lightboxIframe.style.zIndex = '2147483647';
            // lightboxIframe.style.visibility = 'hidden';
            lightboxIframe.style.display = 'none';
            lightboxIframe.frameBorder = '0';
            lightboxIframe.style.border = 'none';
            // lightboxIframe.style.backfaceVisibility = "hidden";
            var lightboxRootUrl = photo_id != undefined ? _api.defaults.lightboxRootUrl + "/" + photo_id : _api.defaults.lightboxRootUrl;

            if (typeof options.widgetId === 'undefined') {
                if (options.displayOptionsId) {
                    lightboxRootUrl = _api.addParam(lightboxRootUrl, "display_options_id", options.displayOptionsId);
                }
                if (options.accountId) {
                    lightboxRootUrl = _api.addParam(lightboxRootUrl, "account_id", options.accountId);
                }
                if (options.type) {
                    lightboxRootUrl = _api.addParam(lightboxRootUrl, "type", options.type);
                }
                if (options.addToCart) {
                    lightboxRootUrl = _api.addParam(lightboxRootUrl, "add_to_cart", 'true');
                }
                if (options.addToCartNavigate !== undefined) {
                    lightboxRootUrl = _api.addParam(lightboxRootUrl, "add_to_cart_navigate", options.addToCartNavigate.toString());
                }
                if (options.recipeId) {
                    lightboxRootUrl = _api.addParam(lightboxRootUrl, "recipe_id", options.recipeId);
                }
                if (options.albumId) {
                    lightboxRootUrl = _api.addParam(lightboxRootUrl, "album_id", options.albumId);
                } else if (options.albumPhotoId) {
                    lightboxRootUrl = _api.addParam(lightboxRootUrl, "album_photo_id", options.albumPhotoId);
                }
            } else {
                lightboxRootUrl = _api.addParam(lightboxRootUrl, "widget_id", options.widgetId);
            }

            if (options.skuId) {
                lightboxRootUrl = _api.addParam(lightboxRootUrl, "product_id", options.skuId);
            }
            if (options.skuOrCategories) {
                lightboxRootUrl = _api.addParam(lightboxRootUrl, "sku_or_categories", options.skuOrCategories);
            }
            if (options.categoryId) {
                lightboxRootUrl = _api.addParam(lightboxRootUrl, "category_id", options.categoryId);
            }
            if (options.previewMode) {
                lightboxRootUrl = _api.addParam(lightboxRootUrl, "previewMode", options.previewMode);
            }
            if (options.isFacebook) {
                lightboxRootUrl = _api.addParam(lightboxRootUrl, "is_facebook", options.isFacebook);
            }

            if (mobileCheck()) {
                lightboxRootUrl = _api.addParam(lightboxRootUrl, "mobile", true);
            } else if (tabletCheck()) {
                lightboxRootUrl = _api.addParam(lightboxRootUrl, "tablet", true);
            }
            if (_api.ApiKey) {
                lightboxRootUrl = _api.addParam(lightboxRootUrl, "api_key", _api.ApiKey);
            }
            lightboxIframe.onerror = function(error) {
                _api.iframeErrorHandler(error, lightboxIframe.id);
            };
            lightboxIframe.onload = function(error) {
                if (options.onLightboxLoaded) {
                    options.onLightboxLoaded();
                }
            };

            var initiateIframe = function() {
                lightboxIframe.src = lightboxRootUrl;

                if (!_api.priority) {
                    document.body.appendChild(lightboxIframe);
                }
                lightbox_iframe = lightboxIframe;
            };

            lightboxRootUrl = _api.addParam(lightboxRootUrl, "parent_url", document.location.href.split(/[?#]/)[0]);
            //if it's a direct link, we want to make sure the distillery call will work (this is for multiple widgets)
            if (photo_id !== null) {
                var albumPhotoValidity = new XMLHttpRequest();
                albumPhotoValidity.onloadend = function() {
                    if (albumPhotoValidity.readyState === XMLHttpRequest.DONE) {
                        //if the call will succeed, proceed as per usual
                        if (albumPhotoValidity.status >= 200 && albumPhotoValidity.status < 400) {
                            initiateIframe();
                        } else {
                            _api.createLightboxContainer(options, null);
                        }

                    }
                };
                lightbox_iframe = lightboxIframe;
                //ping the url
                albumPhotoValidity.open('GET', lightboxRootUrl, true);
                albumPhotoValidity.send();
            } else {
                initiateIframe();
            }
        }
    });


    _api.provide('createLightboxUploader', function(options, photo_id) {
        if (typeof options !== 'object') {
            var frame = document.querySelector('iframe[src="' + options + '"]');
            options = widget_iframes[frame.id].options;
        }

        //create the lightbox Iframe
        if (!document.querySelector("#" + _api.defaults.uploaderId)) {
            var uploaderFrame = document.createElement("iframe");
            uploaderFrame.id = _api.defaults.uploaderId;
            uploaderFrame.width = '100%';
            uploaderFrame.height = '100%';
            uploaderFrame.title = 'Upload customer photos with Pixlee';
            uploaderFrame.style.top = '0';
            uploaderFrame.style.left = '0';
            uploaderFrame.style.position = 'fixed';
            uploaderFrame.style.zIndex = '2147483647';
            uploaderFrame.style.visibility = 'hidden';
            uploaderFrame.frameBorder = '0';
            uploaderFrame.style.border = 'none';
            var uploaderRootUrl = _api.defaults.uploaderUrl;

            if (typeof options.widgetId === 'undefined') {
                if (options.displayOptionsId) {
                    uploaderRootUrl = _api.addParam(uploaderRootUrl, "display_options_id", options.displayOptionsId);
                }
                if (options.recipeId) {
                    uploaderRootUrl = _api.addParam(uploaderRootUrl, "recipe_id", options.recipeId);
                }
                if (options.type) {
                    uploaderRootUrl = _api.addParam(uploaderRootUrl, "type", options.type);
                } else {
                    uploaderRootUrl = _api.addParam(uploaderRootUrl, "type", "uploader");
                }
                if (_api.ApiKey) {
                    uploaderRootUrl = _api.addParam(uploaderRootUrl, "api_key", _api.ApiKey);
                }
                if (options.accountId) {
                    uploaderRootUrl = _api.addParam(uploaderRootUrl, "account_id", options.accountId);
                }
                if (options.albumId) {
                    uploaderRootUrl = _api.addParam(uploaderRootUrl, "album_id", options.albumId);
                }
                if (options.albumPhotoId) {
                    uploaderRootUrl = _api.addParam(uploaderRootUrl, "album_photo_id", options.albumPhotoId);
                }
            } else {
                uploaderRootUrl = _api.addParam(uploaderRootUrl, "widget_id", options.widgetId);
            }

            if (options.previewMode) {
                uploaderRootUrl = _api.addParam(uploaderRootUrl, "previewMode", options.previewMode);
            }
            if (options.skuId) {
                uploaderRootUrl = _api.addParam(uploaderRootUrl, "product_id", options.skuId);
            }
            if (options.skuOrCategories) {
                uploaderRootUrl = _api.addParam(uploaderRootUrl, "sku_or_categories", options.skuOrCategories);
            }
            if (mobileCheck()) {
                uploaderRootUrl = _api.addParam(uploaderRootUrl, "mobile", true);
            } else if (tabletCheck()) {
                uploaderRootUrl = _api.addParam(uploaderRootUrl, "tablet", true);
            }
            uploaderFrame.onerror = function(error) {
                _api.iframeErrorHandler(error, uploaderFrame.id);
            };
            uploaderFrame.onload = function() {
                // console.log("uploader loaded");
                uploaderFrame.style.visibility = '';
                if (options.onUploaderLoaded) {
                    options.onUploaderLoaded();
                }
            };
            uploaderFrame.src = uploaderRootUrl;
            document.body.appendChild(uploaderFrame);
            setTimeout(function() {
                iFrameResize({
                    log: false, // Enable console logging
                    enablePublicMethods: true, // Enable methods within iframe hosted page
                    heightCalculationMethod: "grow",
                    checkOrigin: false,
                    sizeWidth: true
                }, '#' + uploaderFrame.id);
            }, 0);
            uploader_iframe = uploaderFrame;
        }
    });

    _api.provide('createSocialAuth', function(options, photo_id) {
        //create the lightbox Iframe
        if (!document.querySelector("#" + _api.defaults.socialAuthId)) {
            var socialAuthFrame = document.createElement("iframe");
            socialAuthFrame.id = _api.defaults.socialAuthId;
            socialAuthFrame.width = '100%';
            socialAuthFrame.height = '100%';
            socialAuthFrame.style.top = '0';
            socialAuthFrame.style.left = '0';
            socialAuthFrame.title = 'Share customer photos with Pixlee';
            socialAuthFrame.style.position = 'fixed';
            socialAuthFrame.style.zIndex = '2147483647';
            socialAuthFrame.style.visibility = 'hidden';
            socialAuthFrame.frameBorder = '0';
            socialAuthFrame.style.border = 'none';
            var socialAuthUrl = _api.defaults.socialAuthUrl;
            if (typeof options.widgetId === 'undefined') {
                if (options.displayOptionsId) {
                    socialAuthUrl = _api.addParam(socialAuthUrl, "display_options_id", options.displayOptionsId);
                }
                if (options.recipeId) {
                    socialAuthUrl = _api.addParam(socialAuthUrl, "recipe_id", options.recipeId);
                }
                if (options.albumId) {
                    socialAuthUrl = _api.addParam(socialAuthUrl, "album_id", options.albumId);
                }
                if (options.accountId) {
                    socialAuthUrl = _api.addParam(socialAuthUrl, "account_id", options.accountId);
                }
                if (options.albumPhotoId) {
                    socialAuthUrl = _api.addParam(socialAuthUrl, "album_photo_id", options.albumPhotoId);
                }
                if (options.type) {
                    socialAuthUrl = _api.addParam(socialAuthUrl, "type", options.type);
                } else {
                    socialAuthUrl = _api.addParam(socialAuthUrl, "type", "social_auth");
                }
            } else {
                socialAuthUrl = _api.addParam(socialAuthUrl, "widget_id", options.widgetId);
            }

            if (_api.ApiKey) {
                socialAuthUrl = _api.addParam(socialAuthUrl, "api_key", _api.ApiKey);
            }
            if (options.categoryId) {
                socialAuthUrl = _api.addParam(socialAuthUrl, "album_id", options.categoryId);
            }

            socialAuthFrame.onerror = function(error) {
                _api.iframeErrorHandler(error, socialAuthFrame.id);
            };
            socialAuthFrame.onload = function() {
                socialAuthFrame.style.visibility = '';
                iFrameResize({
                    log: true, // Enable console logging
                    enablePublicMethods: true, // Enable methods within iframe hosted page
                    heightCalculationMethod: "grow",
                    checkOrigin: false,
                    sizeWidth: true
                });
            };
            socialAuthFrame.src = socialAuthUrl;
            document.body.appendChild(socialAuthFrame);
            social_auth_iframe = socialAuthFrame;
        }
    });

    _api.provide('createCookie', function(args) {
        var cookie = _api.getCookie('pixlee_analytics_cookie');
        if (!cookie) {
            var ob = {};
            ob.CURRENT_PIXLEE_USER_ID = args.distinct_user_hash;
            ob.CURRENT_PIXLEE_ALBUM_PHOTOS = [];
            ob.CURRENT_PIXLEE_ALBUM_PHOTOS_TIMESTAMP = [];
            ob.HORIZONTAL_PAGE = [];
            if (args.AB) ob.AB_TEST = args.AB;
            if (!ob.CURRENT_PIXLEE_USER_ID) ob.CURRENT_PIXLEE_USER_ID = args.fingerPrint;
            ob.fingerprint = args.fingerPrint;
            _api.setCookie('pixlee_analytics_cookie', ob, 30);
        } else {
            var changed = false;
            if (args.AB) {
                cookie.AB_TEST = args.AB;
                changed = true;
            }
            if (!cookie.CURRENT_PIXLEE_ALBUM_PHOTOS) {
                cookie.CURRENT_PIXLEE_ALBUM_PHOTOS = [];
                changed = true;
            }
            if (!cookie.CURRENT_PIXLEE_ALBUM_PHOTOS_TIMESTAMP) {
                cookie.CURRENT_PIXLEE_ALBUM_PHOTOS_TIMESTAMP = [];
                changed = true;
            }
            if (!cookie.HORIZONTAL_PAGE) {
                cookie.HORIZONTAL_PAGE = [];
                changed = true;
            }
            if (changed) {
                _api.setCookie('pixlee_analytics_cookie', cookie, 30);
            }
        }
    });

    var init_cookie_try = false;

    _api.provide('openedPhoto', function(args) {
        var cookie = _api.getCookie('pixlee_analytics_cookie');
        if (cookie) {
            _api.setCookie('pixlee_analytics_cookie', cookie, 30);
        } else if (!init_cookie_try) {
            init_cookie_try = true;
            _api.createCookie(args);
            _api.openedPhoto(args);
        }
    });

    _api.provide('interacted', function(args) {
        var cookie = _api.getCookie('pixlee_analytics_cookie');
        if (cookie) {
            _api.setCookie('pixlee_analytics_cookie', cookie, 30);
        } else if (!init_cookie_try) {
            init_cookie_try = true;
            _api.createCookie(args);
            _api.interacted(args);
        }
    });

    var api = {
        provide: function(name, fn) {
            this[name] = guard(fn);
        }
    };

    // Function that calls an external function
    api.provide('callCallback', function(callback) {
        callback();
    });

    // Function that throws without it being logged
    api.provide('throwManaged', function(num) {
        if (typeof num !== 'number') {
            throw new ManagedError('Invalid argument');
        }
    });
    api.provide('openUploader', function(options) {
        _api.createLightboxUploader(options);
    });
    api.provide('addSimpleWidget', function(options) {
        var url;
        if (options.albumId) {
            url = _api.addParam(_api.defaults.rootUrl, "album_id", options.albumId);
        } else if (options.albumPhotoId) {
            url = _api.addParam(_api.defaults.rootUrl, "album_photo_id", options.albumPhotoId);
        } else if (options.widgetId) {
            url = _api.addParam(_api.defaults.rootUrl, "widget_id", options.widgetId);
        }

        options.iframe_src = url;
        _api.addWidget(options);
    });
    api.provide('addProductWidget', function(options) {
        var url;
        if (options.ecomm_platform && options.ecomm_platform === 'shopify') {
            var params = {};
            params.api_key = _api.ApiKey;
            var route = window.location.pathname.replace(/\/$/, '').split('/');
            var product_handle = route[route.length - 1];

            var getVariantInfo = new XMLHttpRequest();
            getVariantInfo.onreadystatechange = function() {
                if (getVariantInfo.readyState === XMLHttpRequest.DONE) {
                    if (getVariantInfo.status >= 200 && getVariantInfo.status < 400) {
                        var variantsResponse = JSON.parse(getVariantInfo.responseText);
                        params.variant_sku = variantsResponse.variants[0].sku;
                        params.variant_id = variantsResponse.variants[0].id;

                        var getProductSKU = new XMLHttpRequest();
                        getProductSKU.onreadystatechange = function() {
                            if (getProductSKU.readyState === XMLHttpRequest.DONE) {
                                if (getProductSKU.status >= 200 && getProductSKU.status < 400) {
                                    options.skuId = JSON.parse(getProductSKU.responseText).sku;
                                    url = _api.addParam(_api.defaults.rootUrl, "product_id", options.skuId);
                                    if (options.widgetId) {
                                        url = _api.addParam(url, "widget_id", options.widgetId);
                                    }
                                    options.iframe_src = url;

                                    _api.addWidget(options);
                                    resizeWidget();
                                } else {
                                    console.log('Call to limitless-beyond failed. Status Code ' + getVariantInfo.status);
                                }
                            }
                        }

                        var callToLimitless = '//distillery.pixlee.com/api/v1/accounts/' + options.accountId + '/product_sku_single?'
                        callToLimitless = callToLimitless + 'api_key=' + params.api_key;
                        callToLimitless = callToLimitless + '&variant_sku=' + params.variant_sku;
                        callToLimitless = callToLimitless + '&variant_id=' + params.variant_id;

                        getProductSKU.open('GET', callToLimitless, true);
                        getProductSKU.send();
                    } else {
                        console.log('Call to Shopify API failed. Status Code ' + getVariantInfo.status);
                    }
                }
            };

            getVariantInfo.open('GET', '/products/' + product_handle + '.js', true);
            getVariantInfo.send();

            _api.ecomm_platform = options.ecomm_platform;
        } else {
            if (options.widgetId) {
                url = _api.addParam(_api.defaults.rootUrl, "widget_id", options.widgetId);
                url = _api.addParam(url, "product_id", options.skuId);
            } else if (options.skuId) {
                url = _api.addParam(_api.defaults.rootUrl, "product_id", options.skuId);
            } else {
                url = _api.addParam(_api.defaults.rootUrl, "sku_or_categories", options.skuOrCategories);
            }

            options.iframe_src = url;
            _api.addWidget(options);
        }
    });

    api.provide('addCategoryWidget', function(options) {
        var url = _api.addParam(_api.defaults.rootUrl, "category_id", options.categoryId);
        options.iframe_src = url;
        _api.addWidget(options);
    });
    _api.provide('initMeta', function(options) {
        var headID = document.getElementsByTagName("head")[0];
        var metaNode = document.createElement('meta');
        metaNode.name = 'viewport';
        metaNode.content = 'width=device-width,initial-scale=1,user-scalable=no,maximum-scale=1';
        metaNode.id = 'metatag';
        headID.appendChild(metaNode);
    });
    api.provide('close', function(single_page_app) {
        for (var key in widget_iframes) {
            var frame = widget_iframes[key].iframe;
            frame.parentNode.removeChild(frame);
        }
        widget_iframes = {};
        if (uploader_iframe && uploader_iframe.parentNode) {
            uploader_iframe.parentNode.removeChild(uploader_iframe);
        }
        if (lightbox_iframe && lightbox_iframe.parentNode) {
            lightbox_iframe.parentNode.removeChild(lightbox_iframe);
        }
        if (!single_page_app) {
            window.removeEventListener("message", receiveMessage);
        }
        _api.changeUrl(_api.removeParam('pixlee_album_photo_id', window.location.href));
    });

    _api.provide('addWidget', function(options) {
        var url = options.iframe_src;

        if (options.setMetaTags) {
            _api.initMeta();
        }
        var photo_id = _api.getParameterByName("pixlee_album_photo_id", document.location.href);
        if (!options.lightboxOff) {
            _api.createLightboxContainer(options, photo_id);
        }
        if (options.display_options) {
            url = _api.addParam(url, "display_options", options.display_options);
        }
        if (options.recipe) {
            url = _api.addParam(url, "recipe", options.recipe);
        }
        if (options.previewMode) {
            url = _api.addParam(url, "previewMode", options.previewMode);
        }
        if (options.isFacebook) {
            url = _api.addParam(url, "is_facebook", options.isFacebook);
        }
        if (options.AB) {
            url = _api.addParam(url, "ab_test", true);
        }
        if (typeof options.lightbox !== 'undefined' && !options.lightbox) {
            url = _api.addParam(url, "show_lightbox", 'false');
        }

        //if they have subscribed to our events, map internal names to external
        if (options.subscribedEvents) {
            _api.eventMappings = {
                'photoOpened': 'pixlee:opened:photo',
                'photoClosed': 'pixlee:hide:lightbox',
                'ctaClicked': 'pixlee:cta:clicked',
                'widgetLoaded': 'pixlee:widget:loaded',
                'widgetNumPhotos': 'pixlee:widget:num:photos',
                'widgetLoadMore': 'pixlee:widget:load:more'
            };

            _api.subscribedEvents = options.subscribedEvents.map(function(evt) {
                return _api.eventMappings[evt] || '';
            });
        }

        if (_api.ApiKey) {
            url = _api.addParam(url, "api_key", _api.ApiKey);
        }
        if (typeof options.widgetId === 'undefined') {
            if (options.type) {
                url = _api.addParam(url, "type", options.type);
            }
            if (options.recipeId) {
                url = _api.addParam(url, "recipe_id", options.recipeId);
            }
            if (options.displayOptionsId) {
                url = _api.addParam(url, "display_options_id", options.displayOptionsId);
            }
            if (options.accountId) {
                url = _api.addParam(url, "account_id", options.accountId);
            }
        }

        url = _api.addParam(url, "parent_url", document.location.href.split(/[?#]/)[0]);

        if (mobileCheck()) {
            url = _api.addParam(url, "mobile", true);
        } else if (tabletCheck()) {
            url = _api.addParam(url, "tablet", true);
        }

        var iOS = /iPad|iPhone|iPod/.test(navigator.platform);
        var standalone = document.location.href.indexOf("standalone") !== -1;

        var container = document.getElementById(options.containerId || _api.defaults.containerId);
        if (container) {
            if (container.style.display == 'none') {
                url = _api.addParam(url, "displayed", 'none');
            }
        }
        options.iframeId = _api.defaults.iframeId + guid();
        options.iframe_src = url;
        options.containerId = options.containerId || _api.defaults.containerId;
        var newIframe = document.createElement('iframe');
        newIframe.id = options.iframeId;
        if (options.type === "photowall" || options.type === 'mosaic' || options.type === 'mosaic_v2' || options.type === 'tap2shop') {
            newIframe.style.height = '900px';
        } else {
            newIframe.style.height = '400px';
        }

        if (iOS && !standalone && options.type !== 'tap2shop' && options.type !== 'photowall' && options.type !== 'mosaic' && options.type !== 'mosaic_v2' && options.type !== 'single') {
            newIframe.width = '1px';
        } else {
            newIframe.width = '100%';
        }

        newIframe.style.visibility = _api.priority ? 'hidden' : '';
        newIframe.frameBorder = '0';
        newIframe.style.border = 'none';
        newIframe.title = 'Free Instagram Gallery powered by Pixlee';
        newIframe.onerror = function(error) {
            _api.iframeErrorHandler(error, newIframe.id);
        };
        newIframe.onload = function() {
            if (options.onWidgetLoaded) {
                options.onWidgetLoaded();
            }

            var msg;
            if (options.subscribedEvents && options.subscribedEvents.indexOf('widgetLoaded') >= 0) {
                msg = {
                    name: 'pixlee:widget:loaded',
                    type: 'action',
                    source: 'parent',
                    destination: 'parent',
                    data: {}
                };

                window.parent.postMessage(JSON.stringify(msg), '*');
            }

            //check to see when the widget is visible
            var IframeNode = this;
            var widgetVisibilityListener = function() {
                var visible = unguard(isWidgetVisible)(IframeNode);
                var currentWidget = widget_iframes ? widget_iframes[IframeNode.id] : false;

                if (visible && currentWidget && !currentWidget.wasSeen) {
                    msg = {
                        name: 'pixlee:widget:visible',
                        type: 'relay',
                        source: 'parent',
                        destination: 'widget',
                        data: {
                            src: IframeNode.src
                        }
                    };

                    window.parent.postMessage(JSON.stringify(msg), '*');

                    //once the event fires, we don't want to check for visibility anymore. just 1 event.
                    window.removeEventListener('scroll', widgetVisibilityListener);

                    //make sure times a million that this only fires once per widget
                    widget_iframes[IframeNode.id].wasSeen = true;
                }
            };

            //add the listener on scroll and fire it once initially AFTER listener has been attached, so that if the
            //widget is immediately in view, it doesn't double fire and can remove the listener
            window.addEventListener('scroll', widgetVisibilityListener);
            widgetVisibilityListener();
        };

        newIframe.src = options.iframe_src;

        if (_api.priority) {
            document.getElementById("pixlee_init_container").style.visibility = 'hidden';
            document.getElementById("pixlee_init_container").appendChild(newIframe);
        } else {
            _api.pixContainer = document.getElementById(options.containerId);
            _api.pixContainer.appendChild(newIframe);
            _api.forceAttribution();
        }

        _api.fixedWidth = options.fixedWidth;

        widget_iframes[options.iframeId] = {
            options: options,
            iframe: newIframe
        };
    });

    _api.provide('forceAttribution', function() {
        var poweredBy = document.createElement('a');
        poweredBy.id = 'powered_by_pixlee' + guid();
        poweredBy.target = 'blank';
        poweredBy.title = 'Free Instagram Gallery powered by Pixlee';
        poweredBy.innerHTML = 'Powered by Pixlee';
        poweredBy.href = 'https://www.pixlee.com/social-feed?utm_source=socialfeed_widget&utm_medium=main&utm_campaign=powered%20by';
        poweredBy.setAttribute('style', 'height: 8px!important;width:96px!important;display:block!important;background-image:url("https://assets.pixlee.com/images/embed/glyph/powered_horizontal.png")!important;background-size:96px 8px!important;background-position:center!important;background-repeat:no-repeat!important;background-color:transparent!important;padding:4px 0!important;margin:0 auto!important;line-height:0!important;font-size:0!important;color:transparent!important;');

        var onChangeCallback = function(elem) {
            var poweredBy = elem.target;

            if (poweredBy) {
                poweredBy.removeEventListener('DOMNodeRemoved', onChangeCallback);
                poweredBy.parentNode.removeChild(poweredBy);
            }
            _api.forceAttribution();
        };

        if ("MutationObserver" in window) {
            var observer = new MutationObserver(function(mutations) {
                mutations.forEach(onChangeCallback);
            });

            observer.observe(poweredBy, {
                attributes: true,
                childList: true,
                characterData: true,
                subtree: true
            });
        }

        poweredBy.addEventListener('DOMNodeRemoved', onChangeCallback);
        _api.pixContainer.appendChild(poweredBy);
    });

    api.provide('renderFrame', function() {
        try {
            if (lightbox_iframe) {
                document.body.appendChild(lightbox_iframe);
            }

            var children = document.getElementById("pixlee_init_container");

            for (var widget_iframe in widget_iframes) {
                var currWidget = widget_iframes[widget_iframe];
                var targetId = currWidget.options.containerId;
                var child = children.querySelector('#' + currWidget.options.iframeId);

                document.getElementById(targetId).appendChild(child);
                currWidget.iframe.style.visibility = '';
            }

            resizeWidget();
        } catch (e) {
            console.warn('Failed to render the widget, Probably because pixlee_init_container div is not on the page');
        }
    });
    api.provide('resizeWidget', function(fixedWidth) {
        resizeWidget(fixedWidth);
    });
    api.provide('init', function(options) {
        _api.ApiKey = options.apiKey;
        _api.priority = options.priority;

        // allow for initialization of a specified rootUrl, overriding the default
        if (options.rootUrl !== undefined) {
            _api.defaults.rootUrl = options.rootUrl + "/widget";
            _api.defaults.uploaderUrl = options.rootUrl + "/uploader";
            _api.defaults.lightboxRootUrl = options.rootUrl + "/lightbox";
            _api.defaults.socialAuthUrl = options.rootUrl + "/social_auth";
        }
    });

    if (!window.Pixlee) {
        window.Pixlee = api;
        variableName = "Pixlee";
    } else {
        window.PixleeWidgetsManager = api;
        variableName = "PixleeWidgetsManager";
    }

    if (!_api.priority) {
        if (window.PixleeAsyncInit && !window.PixleeAsyncInit.hasRun) {
            window.Pixlee.hasRun = true;
            unguard(window.PixleeAsyncInit)(variableName);
        }

        if (!_api.ecomm_platform) {
            resizeWidget(_api.fixedWidth);
        }
    }

    function receiveMessage(event) {
        var eventData;
        var tempBackground;
        var i = 0;

        /*********************************************************************************************/
        /* Identify whether this is one of our messages, and if so, turn it into the expected format */
        /*********************************************************************************************/
        if (event.data) {
            try {
                eventData = JSON.parse(event.data);
            } catch (error) {
                // Some other way of sending data, ignore
                return;
            }
            //only capture from our domain OR DATC events from other domains
            if (event.origin.indexOf('pixlee') === -1 && event.origin.indexOf('ngrok') === -1 &&
                (eventData.name && eventData.name.indexOf('pixlee:') !== 0)) {
                return;
            }
        } else {
            return;
        }

        /*******************************************************************************************************/
        /* SUBSCRIBED EVENTS are re-emmitted under an external facing name so customers can interact with them */
        /*******************************************************************************************************/
        if (eventData.name && _api.subscribedEvents && _api.subscribedEvents.indexOf(eventData.name) !== -1) {
            var msg = {};

            //map back to the customer facing event
            for (var key in _api.eventMappings) {
                if (_api.eventMappings[key] === eventData.name) {
                    msg.eventName = key;
                    break;
                }
            }

            if (eventData.data) {
                msg.data = eventData.data;
            }

            window.parent.postMessage(JSON.stringify(msg), '*');
        }

        /*********************************************************************************/
        /* ACTION events require some action to be taken from the parent page (aka here) */
        /*********************************************************************************/
        if (eventData.type && eventData.type === 'action') {
            //Take the appropriate action
            if (eventData.name === 'pixlee:close:widget') {
                var frames = document.getElementsByTagName('iframe');
                for (i = 0; i < frames.length; i++) {
                    if (frames[i].id !== (_api.defaults.lightboxId) && frames[i].contentWindow === event.source) {
                        frames[i].parentNode.removeChild(frames[i]);
                        break;
                    }
                }
            } else if (eventData.name === 'pixlee:scroll:top:fix') {
                window.scrollTo(0, 0);
                document.body.scrollTop = 0;
            } else if (eventData.name && eventData.name === 'pixlee:show:lightbox') {
                setTimeout(function() {
                    lightbox_iframe.offsetHeight; // no need to store this anywhere, the reference is enough
                    lightbox_iframe.style.display = '';
                    lightbox_iframe.style.webkitTransform = 'translatez(0)';
                    lightbox_iframe.style.position = 'fixed';
                    lightbox_iframe.style.zIndex = '2147483647';
                    removeFlickerScreen();
                }, 0);
            } else if (eventData.name && eventData.name === 'pixlee:hide:lightbox') {
                setTimeout(function() {
                    lightbox_iframe.style.display = 'none';
                }, 0);

                if (iOSSafariCheck()) {
                    window.scrollTo(_api.scrollLeftPosition, _api.scrollTopPosition);
                    removeFlickerScreen();
                }
                _api.changeUrl(_api.removeParam('pixlee_album_photo_id', window.location.href));
            } else if (eventData.name && eventData.name === 'pixlee:show:uploader') {
                _api.createLightboxUploader(eventData.data.widgetId);
            } else if (eventData.name && eventData.name === 'pixlee:show:social:connect') {
                _api.createSocialAuth(widget_iframes[eventData.data.widgetId].options);
            } else if (eventData.name && eventData.name === 'pixlee:change:lightbox:image') {
                _api.changeUrl(_api.updateURLParameter(window.location.href, 'pixlee_album_photo_id', eventData.data.id));
            } else if (eventData.name && eventData.name === 'pixlee:remove:url:param') {
                _api.changeUrl(_api.removeParam('pixlee_album_photo_id', window.location.href));
            } else if (eventData.name && eventData.name === 'pixlee:create:cookie') {
                if (eventData.data) {
                    _api.createCookie(eventData.data);
                }
            } else if (eventData.name && eventData.name === 'pixlee:opened:photo') {
                if (eventData.data) {
                    _api.openedPhoto(eventData.data);
                }
            } else if (eventData.name && eventData.name === 'pixlee:interacted') {
                if (eventData.data) {
                    _api.interacted(eventData.data);
                }
            } else if (eventData.name && eventData.name === 'pixlee:close:uploader') {
                setTimeout(function() {
                    uploader_iframe.parentNode.removeChild(uploader_iframe);
                }, 0);
            } else if (eventData.name && eventData.name === 'pixlee:interactive:widget:resize') {
                var originalStyle;
                var originalPos;

                for (var id in widget_iframes) {
                    var currentWidget = widget_iframes[id].iframe;

                    //only alter the widget which initiated this event
                    if (currentWidget.contentWindow === event.source) {
                        if (eventData.data.active) {
                            originalStyle = currentWidget.getAttribute('style');
                            originalPos = window.scrollY || 0;

                            currentWidget.setAttribute('style', 'top: 0px; left: 0px; width: 100%; height: 100%; padding: 0px; margin: 0px; position: fixed; z-index:2147483647; border: none; overflow: hidden;');

                            _api.setCookie('pixlee_widget_style', originalStyle, 30);
                            _api.setCookie('pixlee_widget_scroll_pos', originalPos, 30);
                        } else {
                            originalStyle = _api.getCookie('pixlee_widget_style');
                            originalPos = _api.getCookie('pixlee_widget_scroll_pos');

                            if (originalStyle) {
                                currentWidget.setAttribute('style', originalStyle);
                            } else {
                                currentWidget.setAttribute('style', 'border: none; overflow: hidden;');
                            }

                            if (originalPos) {
                                window.scrollTo(window.scrollX, originalPos);
                            }
                        }
                    }
                }
            } else if (eventData.name && eventData.name === 'pixlee:interactive:widget:mobile:scroll:top:fix') {
                if (iOSSafariCheck()) {
                    //create a temporary white background to prevent the scrolling from causing a visual flicker
                    createFlickerScreen();
                    window.scrollTo(0, 0);
                    document.body.scrollTop = 0;
                    // Safari has a behavior where it will asynchronously scroll back to the middle of the page after magnific popup opens.
                    // We need to scroll back to the top if the async call happens after trying to go to the top.
                    setTimeout(function() {
                        if (document.body.scrollTop !== 0) {
                            window.scrollTo(0, 0);
                            document.body.scrollTop = 0;
                        }
                    }, 10);
                }
            } else if (eventData.name && eventData.name === 'pixlee:interactive:widget:mobile:horizontal') {
                for (var id in widget_iframes) {
                    var currentWidget = widget_iframes[id].iframe;

                    //only alter the widget which initiated this event
                    if (currentWidget.contentWindow === event.source) {
                        currentWidget.style.width = screen.width + 'px';
                        currentWidget.style.maxWidth = screen.width + 'px';
                    }
                }
            } else if (eventData.name && eventData.name === 'pixlee:widget:size:fix') {
                var iOS = /iPad|iPhone|iPod/.test(navigator.platform);
                var standalone = document.location.href.indexOf('standalone') !== -1;
                var currentOptions = eventData.data;

                for (var id in widget_iframes) {
                    var specifiedOptions = widget_iframes[id].options;
                    var widgetIframe = widget_iframes[id].iframe;

                    //make sure we're only applying this if it's the specified widget, convert message to compare int to int
                    if (specifiedOptions.widgetId && +specifiedOptions.widgetId === currentOptions.widgetId) {
                        if (currentOptions.widgetType === 'photowall' || currentOptions.widgetType === 'mosaic' || currentOptions.widgetType === 'mosaic_v2' || currentOptions.widgetType === 'tap2shop') {
                            widgetIframe.style.height = '900px';
                        } else {
                            widgetIframe.style.height = '400px';
                        }

                        if (iOS && !standalone && currentOptions.widgetType !== 'tap2shop' && currentOptions.widgetType !== 'photowall' && currentOptions.widgetType !== 'mosaic' && currentOptions.widgetType !== 'mosaic_v2' && currentOptions.widgetType !== 'single') {
                            widgetIframe.width = '1px';
                        } else {
                            widgetIframe.width = '100%';
                        }
                    }
                }
            } else if (eventData.name && eventData.name === 'pixlee:message:datc:frame') {
                var atcFrame = document.getElementById(_api.defaults.atcFrameId);
                var data = eventData.data;

                if (!atcFrame) {
                    atcFrame = document.createElement('iframe');
                    atcFrame.setAttribute('id', 'pixlee_add_to_cart_frame');
                    atcFrame.src = data.url;
                    atcFrame.style.visibility = 'hidden';
                    atcFrame.style.position = 'absolute';
                    atcFrame.style.top = '-5000px';
                    atcFrame.style.opacity = "0";
                    document.body.appendChild(atcFrame);
                } else if (data.url && atcFrame.src !== data.url) {
                    atcFrame.src = data.url;
                } else {
                    //TODO: make this its own relay event
                    var msg = {
                        name: 'pixlee:datc:check:stock',
                        // type: 'relay',
                        source: 'lightbox',
                        destination: 'datc',
                        data: {
                            fields: data.fields
                        }
                    };

                    if (atcFrame && atcFrame.contentWindow) {
                        atcFrame.contentWindow.postMessage(JSON.stringify(msg), '*');
                    }
                }
            } else if (eventData.name && eventData.name === 'pixlee:open:lightbox') {
                if (iOSSafariCheck()) {
                    //create a temporary white background to prevent the scrolling from causing a visual flicker
                    createFlickerScreen();
                    _api.scrollLeftPosition = window.pageXOffset || document.documentElement.scrollLeft;
                    _api.scrollTopPosition = window.pageYOffset || document.documentElement.scrollTop;
                    window.scrollTo(0, 0);
                    document.body.scrollTop = 0;
                }
            } else if (eventData.name && eventData.name === 'pixlee:hide:flicker:screen') {
                removeFlickerScreen();
            }

            /***************************************************************************************************************/
            /* If this event's final destination is NOT the parent, then turn it into a relay so it can be sent on its way */
            /***************************************************************************************************************/
            if (eventData.destination !== 'parent') {
                eventData.type = 'relay';
            }
        }

        /**************************************************************************************************/
        /* RELAY events transfer info from one frame to the other (lightbox/widget/uploader/social login) */
        /**************************************************************************************************/
        if (eventData.type && eventData.type === 'relay') {
            var destination = eventData.destination;
            var targetFrames;

            //decide what our target frame is
            if (destination === 'widget') {
                targetFrames = document.querySelectorAll('iframe[id*=pixlee_widget_iframe]');
            } else if (destination === 'lightbox') {
                if (lightbox_iframe !== "undefined") {
                    targetFrames = [lightbox_iframe];
                }
            } else if (destination === 'all') {
                targetFrames = document.querySelectorAll('iframe[id*=pixlee]');
            } else {
                console.log('unknown target frame'); //for dev purposes, catch typos and trace errors etc.
            }
            //let all of the widgets on the page know what we want to do. relay events are safe to pass through and this
            //adds very little overhead since there's hardly ever multiple widgets on a page
            try {
                for (i = 0; i < targetFrames.length; i++) {
                    targetFrames[i].contentWindow.postMessage(JSON.stringify(eventData), '*');
                }
            } catch (e) {
                if ('PixleeAsyncInit' in window && typeof window.PixleeAsyncInit === 'function') {
                    window.PixleeAsyncInit();
                } else {
                    console.warn('Pixlee: widget iframe is not initialized, please check your embed code');
                }
            }
        }
    }
    try {
        window.addEventListener("message", function(e) {
            unguard(receiveMessage)(e);
        }, false);
    } catch (e) {
        console.warn('Pixlee: couldn"t find any container with id pixlee_container');
    }
    if (!Array.prototype.forEach) {
        Array.prototype.forEach = function(fun /*, thisArg */ ) {
            "use strict";
            if (this === void 0 || this === null || typeof fun !== "function") throw new TypeError();

            var
                t = Object(this),
                len = t.length >>> 0,
                thisArg = arguments.length >= 2 ? arguments[1] : void 0;

            for (var i = 0; i < len; i++)
                if (i in t)
                    fun.call(thisArg, t[i], i, t);
        };
    }
})();