process.env.NODE_DEBUG = 'request';
var request = require('request');
var assert = require('assert');
var fs = require('fs');
var now = require('performance-now');

// console.log('setImmediate--+++++',setImmediate);

// function MyThing(options) {
//   this.setupOptions(options);

//   process.nextTick(() => {
//     this.startDoingStuff();
//   });
// }

// const thing = new MyThing();
// thing.getReadyForStuff();


// var extend = require('extend');
// let targetObject = { 
//     a: '888888'
// }
// let object1 = {
//     b:'9999'
// }
// let c  = extend(targetObject, object1);
// console.log('=======');

// console.log(process.env.NODE_DEBUG);

// var Stream = require('stream');

// var src = new Stream();
// src.readable = true;

// var dest = new Stream();
// dest.writable = true;
// dest.write = function(data) {
//     console.log('data', data);
//   assert(data == 'test');
// };

// src.pipe(dest);//source 流向destion

// src.emit('data', 'test');// 触发
// let har = fs.readFileSync('/Users/zhongjie/Desktop/order.jd.com.har').toString();
// // console.log(har);
// let obj = JSON.parse(har);

// console.log(Object.keys(obj));

  // var start = now();
  
  // // Execute the code being timed.
  // for (let i = 0; i <= 10 ; i++) {
  //     console.log('i',i);
  // }  
  // // Take a final timestamp.
  // //返回一个时间戳,以毫秒为单位,精确到千分之一毫秒
  // var end = now();
  
  // // Calculate the time taken and output the result in the console
  // console.log('doTasks took ' + (end - start) + ' milliseconds to execute.');



let options = {
    baseUrl : '',
    // url: 'http://www.baidu.com',
    url:'http://localhost:3001/',
    method: 'GET',
    timeout: 1000,
    // time: true
}

request.debug = true;
// isObject()
var baseRequest = request.defaults({
  headers:  [{
              "name": "Cookie",
              "value": "test"
            },
            {
              "name": "Origin",
              "value": "https://order.jd.com"
            }]
})

baseRequest(options ,function (error, response, body) {
  // console.log(response);
  console.log('error:', error); // Print the error if one occurred
  console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
  console.log('body:', body.length); // Print the HTML for the Google homepage.
});


// var req = http.request(opt, function(res) {
//     util.log('STATUS:', res.statusCode);
//     res.setEncoding('utf8');
//     var resultText = '';
//     res.on('data', (chunk) => {
//         resultText += chunk;
//     });
//     res.on('end', () => {
//         console.log('------end---------');
//         util.log(resultText);
//     });
// });

// req.on('error', (e) => {
//     console.log('-------------------',e);
//     util.log(e);
// });

// util.log("start request...")
// req.end();




// var har =   {
 //          "method": "POST",
 //          "url": "https://order.jd.com/lazy/getOrderProductInfo.action",
 //          "httpVersion": "HTTP/1.1",
 //          "headers": [
 //            {
 //              "name": "Cookie",
 //              "value": "unpl=V2_ZzNtbUcESkdyAEVcc0wPBGJRGw8RVktCcgpCV3hJWVViU0YOclRCFXMUR11nGl0UZwQZXUJcQhFFCHZXchBYAWcCGllyBBNNIEwHDCRSBUE3XHxcFVUWF3RaTwEoSVoAYwtBDkZUFBYhW0IAKElVVTUFR21yVEMldQl2VHIaWAJkARBcSmdzEkU4dlR4HFoGZDMTbUNnAUEpCE5ReRhcSGcKEVlFVEEXdAB2VUsa; TrackID=17wjkdrsNvXi85Z7_OhrGR3mbJ6Y9Knjo713cE91_btR4RZH1u8b6_tO6Gv9D2tBtHAGHEHyQ6B5Tj_JSQ-A4Ml1Pfpb165vyAl_foZgzuyn4DAoC0loED6Er7ATj6qF9kU8a3aXOB_hYcTuEBLklnw; pinId=58XGppgzEpFAtSVduVezdbV9-x-f3wj7; pin=jd_58aa31fb902f0; unick=%E5%90%91%E6%97%A5%E8%91%B5235_; thor=7768D141D4FC5AD88D86ADB49AE9CBC347548E6C31476C53C52D897422A0F80CC50A85B532F96CCD34285E5C777FC08F252953D6C2BB63CAFE02761B3C99997BEAF1E77996DA2D27DDCF1E667133D15F94D005A7567353701D9C9E0B85AAEE02E94B6E39452ACA68892094184E9EE8DC5EA1E4F1C81C1DCDF53AEE2EB01AB8E8B6C7E8B8FDAC7A827A97DCBE257598EE9C98987CA967C0A350E4FE45F0D4EE72; _tp=RbH6oQvrnS1SEoyKw24iT9F8e5cOSX7SiqAiKxWHAEQ%3D; _pst=jd_58aa31fb902f0; ceshi3.com=000; __jdv=122270672|baidu-pinzhuan|t_288551095_baidupinzhuan|cpc|0f3d30c8dba7459bb52f2eb5eba8ac7d_0_4b8c69299db04c8cb09f63522a4a4aeb|1503216700997; __jda=122270672.1825623309.1503216671.1503216671.1503216673.1; __jdb=122270672.5.1825623309|1.1503216673; __jdc=122270672; __jdu=1825623309; 3AB9D23F7A4B3C9B=OIU7NQIR3IBLSHHXUQDFP4GXITUYFXIMYSYQAU326NV6K6AXY333G2UY7UXHOX5JJDEUQSLKFRGJ5QTFASDBWCRX7M"
 //            },
 //            {
 //              "name": "Origin",
 //              "value": "https://order.jd.com"
 //            },
 //            {
 //              "name": "Accept-Encoding",
 //              "value": "gzip, deflate"
 //            },
 //            {
 //              "name": "Host",
 //              "value": "order.jd.com"
 //            },
 //            {
 //              "name": "Accept-Language",
 //              "value": "zh-CN,zh;q=0.8"
 //            },
 //            {
 //              "name": "User-Agent",
 //              "value": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.75 Safari/537.36 QQBrowser/4.1.4132.400"
 //            },
 //            {
 //              "name": "Content-Type",
 //              "value": "application/x-www-form-urlencoded"
 //            },
 //            {
 //              "name": "Accept",
 //              "value": "*/*"
 //            },
 //            {
 //              "name": "Cache-Control",
 //              "value": "max-age=0"
 //            },
 //            {
 //              "name": "X-Requested-With",
 //              "value": "XMLHttpRequest"
 //            },
 //            {
 //              "name": "Connection",
 //              "value": "keep-alive"
 //            },
 //            {
 //              "name": "Referer",
 //              "value": "https://order.jd.com/center/list.action"
 //            },
 //            {
 //              "name": "Content-Length",
 //              "value": "270"
 //            }
 //          ],
 //          "queryString": [],
 //          "cookies": [
 //            {
 //              "name": "unpl",
 //              "value": "V2_ZzNtbUcESkdyAEVcc0wPBGJRGw8RVktCcgpCV3hJWVViU0YOclRCFXMUR11nGl0UZwQZXUJcQhFFCHZXchBYAWcCGllyBBNNIEwHDCRSBUE3XHxcFVUWF3RaTwEoSVoAYwtBDkZUFBYhW0IAKElVVTUFR21yVEMldQl2VHIaWAJkARBcSmdzEkU4dlR4HFoGZDMTbUNnAUEpCE5ReRhcSGcKEVlFVEEXdAB2VUsa",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "TrackID",
 //              "value": "17wjkdrsNvXi85Z7_OhrGR3mbJ6Y9Knjo713cE91_btR4RZH1u8b6_tO6Gv9D2tBtHAGHEHyQ6B5Tj_JSQ-A4Ml1Pfpb165vyAl_foZgzuyn4DAoC0loED6Er7ATj6qF9kU8a3aXOB_hYcTuEBLklnw",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "pinId",
 //              "value": "58XGppgzEpFAtSVduVezdbV9-x-f3wj7",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "pin",
 //              "value": "jd_58aa31fb902f0",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "unick",
 //              "value": "%E5%90%91%E6%97%A5%E8%91%B5235_",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "thor",
 //              "value": "7768D141D4FC5AD88D86ADB49AE9CBC347548E6C31476C53C52D897422A0F80CC50A85B532F96CCD34285E5C777FC08F252953D6C2BB63CAFE02761B3C99997BEAF1E77996DA2D27DDCF1E667133D15F94D005A7567353701D9C9E0B85AAEE02E94B6E39452ACA68892094184E9EE8DC5EA1E4F1C81C1DCDF53AEE2EB01AB8E8B6C7E8B8FDAC7A827A97DCBE257598EE9C98987CA967C0A350E4FE45F0D4EE72",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "_tp",
 //              "value": "RbH6oQvrnS1SEoyKw24iT9F8e5cOSX7SiqAiKxWHAEQ%3D",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "_pst",
 //              "value": "jd_58aa31fb902f0",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "ceshi3.com",
 //              "value": "000",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "__jdv",
 //              "value": "122270672|baidu-pinzhuan|t_288551095_baidupinzhuan|cpc|0f3d30c8dba7459bb52f2eb5eba8ac7d_0_4b8c69299db04c8cb09f63522a4a4aeb|1503216700997",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "__jda",
 //              "value": "122270672.1825623309.1503216671.1503216671.1503216673.1",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "__jdb",
 //              "value": "122270672.5.1825623309|1.1503216673",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "__jdc",
 //              "value": "122270672",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "__jdu",
 //              "value": "1825623309",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            },
 //            {
 //              "name": "3AB9D23F7A4B3C9B",
 //              "value": "OIU7NQIR3IBLSHHXUQDFP4GXITUYFXIMYSYQAU326NV6K6AXY333G2UY7UXHOX5JJDEUQSLKFRGJ5QTFASDBWCRX7M",
 //              "expires": null,
 //              "httpOnly": false,
 //              "secure": false
 //            }
 //          ],
 //          "headersSize": 1863,
 //          "bodySize": 270,
 //          "postData": {
 //            "mimeType": "application/x-www-form-urlencoded",
 //            "text": "orderWareIds=1396510759%2C11134512%2C4586850%2C4450908%2C1161131%2C673900&orderWareTypes=0%2C0%2C0%2C0%2C0%2C0&orderIds=60075196719%2C59807909736%2C59970375702%2C59970375702%2C58679283407%2C58921244060&orderTypes=22%2C0%2C0%2C0%2C0%2C0&orderSiteIds=0%2C0%2C0%2C0%2C0%2C0",
 //            "params": [
 //              {
 //                "name": "orderWareIds",
 //                "value": "1396510759%2C11134512%2C4586850%2C4450908%2C1161131%2C673900"
 //              },
 //              {
 //                "name": "orderWareTypes",
 //                "value": "0%2C0%2C0%2C0%2C0%2C0"
 //              },
 //              {
 //                "name": "orderIds",
 //                "value": "60075196719%2C59807909736%2C59970375702%2C59970375702%2C58679283407%2C58921244060"
 //              },
 //              {
 //                "name": "orderTypes",
 //                "value": "22%2C0%2C0%2C0%2C0%2C0"
 //              },
 //              {
 //                "name": "orderSiteIds",
 //                "value": "0%2C0%2C0%2C0%2C0%2C0"
 //              }
 //            ]
 //          }
 //        }




















