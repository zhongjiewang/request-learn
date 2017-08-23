'use strict'
console.log('------------request----------------------');
var http = require('http')
  , https = require('https')
  , url = require('url')
  , util = require('util')
  , stream = require('stream')
  , zlib = require('zlib')
  , hawk = require('hawk')
  , aws2 = require('aws-sign2')
  , aws4 = require('aws4')
  , httpSignature = require('http-signature')
  , mime = require('mime-types')
  , stringstream = require('stringstream')
  , caseless = require('caseless')
  , ForeverAgent = require('forever-agent')
  , FormData = require('form-data')
  , extend = require('extend')
  , isstream = require('isstream')
  , isTypedArray = require('is-typedarray').strict
  , helpers = require('./lib/helpers')
  , cookies = require('./lib/cookies')
  , getProxyFromURI = require('./lib/getProxyFromURI')
  , Querystring = require('./lib/querystring').Querystring
  , Har = require('./lib/har').Har
  , Auth = require('./lib/auth').Auth
  , OAuth = require('./lib/oauth').OAuth
  , Multipart = require('./lib/multipart').Multipart
  , Redirect = require('./lib/redirect').Redirect
  , Tunnel = require('./lib/tunnel').Tunnel
  , now = require('performance-now')
  , Buffer = require('safe-buffer').Buffer

var safeStringify = helpers.safeStringify
  , isReadStream = helpers.isReadStream
  , toBase64 = helpers.toBase64
  , defer = helpers.defer
  , copy = helpers.copy
  , version = helpers.version
  , globalCookieJar = cookies.jar()


var globalPool = {}

function filterForNonReserved(reserved, options) {
  // Filter out properties that are not reserved.
  // Reserved values are passed in at call site.

  var object = {}
  for (var i in options) {
    var notReserved = (reserved.indexOf(i) === -1)
    if (notReserved) {
      object[i] = options[i]
    }
  }
  return object
}

function filterOutReservedFunctions(reserved, options) {
  // Filter out properties that are functions and are reserved.
  // Reserved values are passed in at call site.

  var object = {}
  for (var i in options) {
    var isReserved = !(reserved.indexOf(i) === -1)
    var isFunction = (typeof options[i] === 'function')
    // console.log('isReserved', isReserved, isFunction, options[i]);
    if (!(isReserved && isFunction)) {
      object[i] = options[i]
    }
  }
  return object

}

// Return a simpler request object to allow serialization
function requestToJSON() {
  var self = this
  return {
    uri: self.uri,
    method: self.method,
    headers: self.headers
  }
}

// Return a simpler response object to allow serialization
function responseToJSON() {
  var self = this
  return {
    statusCode: self.statusCode,
    body: self.body,
    headers: self.headers,
    request: requestToJSON.call(self.request)
  }
}

function Request (options) {
  // if given the method property in options, set property explicitMethod to true
// console.log('options--------',options);
  // extend the Request instance with any non-reserved properties
  // remove any reserved functions from the options object
  // set Request instance to be readable and writable
  // call init

  var self = this

  // start with HAR, then override with additional options
  if (options.har) {
    self._har = new Har(self)
    options = self._har.options(options)
  }

  stream.Stream.call(self)
  var reserved = Object.keys(Request.prototype) // reserved 是保留的
  // console.log('reserved--',reserved, '\noptions', options);
  var nonReserved = filterForNonReserved(reserved, options)
  // console.log('nonReserved', nonReserved);
  extend(self, nonReserved)
  // console.log('self', self.callback);
  options = filterOutReservedFunctions(reserved, options)
  // console.log('out reserved--options---',options);
  
  self.readable = true
  self.writable = true
  if (options.method) {
    self.explicitMethod = true
  }
  self._qs = new Querystring(self)
  self._auth = new Auth(self)
  self._oauth = new OAuth(self)
  self._multipart = new Multipart(self)
  self._redirect = new Redirect(self)
  self._tunnel = new Tunnel(self)
  self.init(options)
}
//inherits 继承的意思;
//Sub 仅仅继承了Base 在原型中定义的函数，而构造函数内部创造的 base 属 性和 sayHello 函数都没有被 Sub 继承。
util.inherits(Request, stream.Stream)

// Debugging
Request.debug = process.env.NODE_DEBUG && /\brequest\b/.test(process.env.NODE_DEBUG)
console.log('request-----debug', Request.debug);
function debug() {
  if (Request.debug) {
    console.error('REQUEST %s', util.format.apply(util, arguments))
  }
}
Request.prototype.debug = debug

Request.prototype.init = function (options) {
  console.log('request ----init---------');
  // init() contains all the code to setup the request object.
  // the actual outgoing request is not started until start() is called
  // this function is called from both the constructor and on redirect.
  var self = this
  if (!options) {
    options = {}
  }
  self.headers = self.headers ? copy(self.headers) : {}

  // Delete headers with value undefined since they break
  // ClientRequest.OutgoingMessage.setHeader in node 0.12
  for (var headerName in self.headers) {
    if (typeof self.headers[headerName] === 'undefined') {
      delete self.headers[headerName]
    }
  }

  caseless.httpify(self, self.headers)

  if (!self.method) {
    self.method = options.method || 'GET'
  }
  if (!self.localAddress) {
    self.localAddress = options.localAddress
  }

  self._qs.init(options)

  debug(options)
  if (!self.pool && self.pool !== false) {
    self.pool = globalPool
  }
  self.dests = self.dests || []
  self.__isRequestRequest = true
 // console.log('init callback', self.callback);
  // Protect against double callback
  if (!self._callback && self.callback) {
    self._callback = self.callback
    self.callback = function () {
      if (self._callbackCalled) {
        return // Print a warning maybe?
      }
      self._callbackCalled = true
      console.log('--call back 总回调-double callback--- function---');
      self._callback.apply(self, arguments)
    }
    console.log('------------protect against double callback------------');
    //* bind 是返回对应函数，便于稍后调用；apply 、call 则是立即调用 。
    self.on('error', self.callback.bind()) //bind 中的参数可以省略
    self.on('complete', self.callback.bind(self, null))
  }

  // People use this property instead all the time, so support it
  if (!self.uri && self.url) {
    self.uri = self.url
    delete self.url
  }

  // If there's a baseUrl, then use it as the base URL (i.e. uri must be
  // specified as a relative path and is appended to baseUrl).
  if (self.baseUrl) {
    if (typeof self.baseUrl !== 'string') {
      return self.emit('error', new Error('options.baseUrl must be a string'))
    }

    if (typeof self.uri !== 'string') {
      return self.emit('error', new Error('options.uri must be a string when using options.baseUrl'))
    }

    if (self.uri.indexOf('//') === 0 || self.uri.indexOf('://') !== -1) {
      return self.emit('error', new Error('options.uri must be a path when using options.baseUrl'))
    }

    // Handle all cases to make sure that there's only one slash between
    // baseUrl and uri.
    var baseUrlEndsWithSlash = self.baseUrl.lastIndexOf('/') === self.baseUrl.length - 1
    var uriStartsWithSlash = self.uri.indexOf('/') === 0

    if (baseUrlEndsWithSlash && uriStartsWithSlash) {
      self.uri = self.baseUrl + self.uri.slice(1)
    } else if (baseUrlEndsWithSlash || uriStartsWithSlash) {
      self.uri = self.baseUrl + self.uri
    } else if (self.uri === '') {
      self.uri = self.baseUrl
    } else {
      self.uri = self.baseUrl + '/' + self.uri
    }
    delete self.baseUrl
  }

  // A URI is needed by this point, emit error if we haven't been able to get one
  if (!self.uri) {
    return self.emit('error', new Error('options.uri is a required argument'))
  }

  // If a string URI/URL was given, parse it into a URL object
  if (typeof self.uri === 'string') {
    self.uri = url.parse(self.uri)
  }

  // Some URL objects are not from a URL parsed string and need href added
  if (!self.uri.href) {
    self.uri.href = url.format(self.uri)
  }

  // DEPRECATED: Warning for users of the old Unix Sockets URL Scheme
  if (self.uri.protocol === 'unix:') {
    return self.emit('error', new Error('`unix://` URL scheme is no longer supported. Please use the format `http://unix:SOCKET:PATH`'))
  }

  // Support Unix Sockets
  if (self.uri.host === 'unix') {
    self.enableUnixSocket()
  }

  if (self.strictSSL === false) {
    self.rejectUnauthorized = false
  }

  if (!self.uri.pathname) {self.uri.pathname = '/'}

  if (!(self.uri.host || (self.uri.hostname && self.uri.port)) && !self.uri.isUnix) {
    // Invalid URI: it may generate lot of bad errors, like 'TypeError: Cannot call method `indexOf` of undefined' in CookieJar
    // Detect and reject it as soon as possible
    var faultyUri = url.format(self.uri)
    var message = 'Invalid URI "' + faultyUri + '"'
    if (Object.keys(options).length === 0) {
      // No option ? This can be the sign of a redirect
      // As this is a case where the user cannot do anything (they didn't call request directly with this URL)
      // they should be warned that it can be caused by a redirection (can save some hair)
      message += '. This can be caused by a crappy redirection.'
    }
    // This error was fatal
    self.abort()
    return self.emit('error', new Error(message))
  }

  if (!self.hasOwnProperty('proxy')) {
    self.proxy = getProxyFromURI(self.uri)
  }

  self.tunnel = self._tunnel.isEnabled()
  if (self.proxy) {
    self._tunnel.setup(options)
  }

  self._redirect.onRequest(options)

  self.setHost = false
  if (!self.hasHeader('host')) {
    var hostHeaderName = self.originalHostHeaderName || 'host'
    // When used with an IPv6 address, `host` will provide
    // the correct bracketed format, unlike using `hostname` and
    // optionally adding the `port` when necessary.
    self.setHeader(hostHeaderName, self.uri.host)
    self.setHost = true
  }

  self.jar(self._jar || options.jar)

  if (!self.uri.port) {
    if (self.uri.protocol === 'http:') {self.uri.port = 80}
    else if (self.uri.protocol === 'https:') {self.uri.port = 443}
  }

  if (self.proxy && !self.tunnel) {
    self.port = self.proxy.port
    self.host = self.proxy.hostname
  } else {
    self.port = self.uri.port
    self.host = self.uri.hostname
  }

  if (options.form) {
    self.form(options.form)
  }

  if (options.formData) {
    var formData = options.formData
    var requestForm = self.form()
    var appendFormValue = function (key, value) {
      if (value && value.hasOwnProperty('value') && value.hasOwnProperty('options')) {
        requestForm.append(key, value.value, value.options)
      } else {
        requestForm.append(key, value)
      }
    }
    for (var formKey in formData) {
      if (formData.hasOwnProperty(formKey)) {
        var formValue = formData[formKey]
        if (formValue instanceof Array) {
          for (var j = 0; j < formValue.length; j++) {
            appendFormValue(formKey, formValue[j])
          }
        } else {
          appendFormValue(formKey, formValue)
        }
      }
    }
  }

  if (options.qs) {
    self.qs(options.qs)
  }

  if (self.uri.path) {
    self.path = self.uri.path
  } else {
    self.path = self.uri.pathname + (self.uri.search || '')
  }

  if (self.path.length === 0) {
    self.path = '/'
  }

  // Auth must happen last in case signing is dependent on other headers
  if (options.aws) {
    self.aws(options.aws)
  }

  if (options.hawk) {
    self.hawk(options.hawk)
  }

  if (options.httpSignature) {
    self.httpSignature(options.httpSignature)
  }

  if (options.auth) {
    if (Object.prototype.hasOwnProperty.call(options.auth, 'username')) {
      options.auth.user = options.auth.username
    }
    if (Object.prototype.hasOwnProperty.call(options.auth, 'password')) {
      options.auth.pass = options.auth.password
    }

    self.auth(
      options.auth.user,
      options.auth.pass,
      options.auth.sendImmediately,
      options.auth.bearer
    )
  }

  if (self.gzip && !self.hasHeader('accept-encoding')) {
    self.setHeader('accept-encoding', 'gzip, deflate')
  }

  if (self.uri.auth && !self.hasHeader('authorization')) {
    var uriAuthPieces = self.uri.auth.split(':').map(function(item) {return self._qs.unescape(item)})
    self.auth(uriAuthPieces[0], uriAuthPieces.slice(1).join(':'), true)
  }

  if (!self.tunnel && self.proxy && self.proxy.auth && !self.hasHeader('proxy-authorization')) {
    var proxyAuthPieces = self.proxy.auth.split(':').map(function(item) {return self._qs.unescape(item)})
    var authHeader = 'Basic ' + toBase64(proxyAuthPieces.join(':'))
    self.setHeader('proxy-authorization', authHeader)
  }

  if (self.proxy && !self.tunnel) {
    self.path = (self.uri.protocol + '//' + self.uri.host + self.path)
  }

  if (options.json) {
    self.json(options.json)
  }
  if (options.multipart) {
    self.multipart(options.multipart)
  }

  if (options.time) {
    self.timing = true

    // NOTE: elapsedTime is deprecated in favor of .timings
    self.elapsedTime = self.elapsedTime || 0
  }
  console.log('--------request---init---middle------');
  function setContentLength () {
    if (isTypedArray(self.body)) {
      self.body = Buffer.from(self.body)
    }

    if (!self.hasHeader('content-length')) {
      var length
      if (typeof self.body === 'string') {
        length = Buffer.byteLength(self.body)
      }
      else if (Array.isArray(self.body)) {
        length = self.body.reduce(function (a, b) {return a + b.length}, 0)
      }
      else {
        length = self.body.length
      }

      if (length) {
        self.setHeader('content-length', length)
      } else {
        self.emit('error', new Error('Argument error, options.body.'))
      }
    }
  }
  if (self.body && !isstream(self.body)) {
    setContentLength()
  }

  if (options.oauth) {
    self.oauth(options.oauth)
  } else if (self._oauth.params && self.hasHeader('authorization')) {
    self.oauth(self._oauth.params)
  }

  var protocol = self.proxy && !self.tunnel ? self.proxy.protocol : self.uri.protocol
    , defaultModules = {'http:':http, 'https:':https}
    , httpModules = self.httpModules || {}
  // console.log('httpModules--------',httpModules, defaultModules);
  self.httpModule = httpModules[protocol] || defaultModules[protocol]
  // console.log('self-----httpModule--------',self.httpModule);//就是http


  if (!self.httpModule) {
    return self.emit('error', new Error('Invalid protocol: ' + protocol))
  }

  if (options.ca) {
    self.ca = options.ca
  }

  if (!self.agent) {
    if (options.agentOptions) {
      self.agentOptions = options.agentOptions
    }

    if (options.agentClass) {
      self.agentClass = options.agentClass
    } else if (options.forever) {
      var v = version()
      // use ForeverAgent in node 0.10- only
      if (v.major === 0 && v.minor <= 10) {
        self.agentClass = protocol === 'http:' ? ForeverAgent : ForeverAgent.SSL
      } else {
        self.agentClass = self.httpModule.Agent
        self.agentOptions = self.agentOptions || {}
        self.agentOptions.keepAlive = true
      }
    } else {
      self.agentClass = self.httpModule.Agent
    }
  }

  if (self.pool === false) {
    self.agent = false
  } else {
    self.agent = self.agent || self.getNewAgent()
  }

  self.on('pipe', function (src) {
    if (self.ntick && self._started) {
      self.emit('error', new Error('You cannot pipe to this stream after the outbound request has started.'))
    }
    self.src = src
    if (isReadStream(src)) {
      if (!self.hasHeader('content-type')) {
        self.setHeader('content-type', mime.lookup(src.path))
      }
    } else {
      if (src.headers) {
        for (var i in src.headers) {
          if (!self.hasHeader(i)) {
            self.setHeader(i, src.headers[i])
          }
        }
      }
      if (self._json && !self.hasHeader('content-type')) {
        self.setHeader('content-type', 'application/json')
      }
      if (src.method && !self.explicitMethod) {
        self.method = src.method
      }
    }

    // self.on('pipe', function () {
    //   console.error('You have already piped to this stream. Pipeing twice is likely to break the request.')
    // })
  })
  // 立即定时器,This is executed after all I/O callbacks.类似于转化成异步
  //setTimeout(function(){},0); process.nextTick
  defer(function () {
    if (self._aborted) {
      return
    }

    var end = function () {
      console.log('---------end------------------');
      if (self._form) {
        console.log('---------end---------------self._form---',self._form);
        if (!self._auth.hasAuth) {
          self._form.pipe(self)
        }
        else if (self._auth.hasAuth && self._auth.sentAuth) {
          self._form.pipe(self)
        }
      }
      if (self._multipart && self._multipart.chunked) {
        console.log('---------end---------------self._multipart---',self._multipart);
        self._multipart.body.pipe(self)
      }
      console.log('---------end------------self._multipart---self.body---');

      if (self.body) {
        console.log('---------end---------------self.body---',self.body);
        if (isstream(self.body)) {
          self.body.pipe(self)
        } else {
          setContentLength()
          if (Array.isArray(self.body)) {
            self.body.forEach(function (part) {
              console.log('end method ----write-----');
              self.write(part)
            })
          } else {
            console.log('end method ----write-----');
            self.write(self.body)
          }
          self.end()
        }
      } else if (self.requestBodyStream) {
        console.warn('options.requestBodySstream is deprecated, please pass the request object to stream.pipe.')
        self.requestBodyStream.pipe(self)
      } else if (!self.src) {
        if (self._auth.hasAuth && !self._auth.sentAuth) {
          self.end()
          return
        }
        if (self.method !== 'GET' && typeof self.method !== 'undefined') {
          self.setHeader('content-length', 0)
        }
        console.log('---------end------------!self.src---');
        self.end()
      }
    }

    if (self._form && !self.hasHeader('content-length')) {
      
      // Before ending the request, we had to compute the length of the whole form, asyncly
      self.setHeader(self._form.getHeaders(), true)
      self._form.getLength(function (err, length) {
        if (!err && !isNaN(length)) {
          self.setHeader('content-length', length)
        }
        console.log('will call end 1111111');
        end()
      })
    } else {
      console.log('will call end  22222222');
      end()
    }

    self.ntick = true
  })
  console.log('init-------end---');
}

Request.prototype.getNewAgent = function () {
  var self = this
  var Agent = self.agentClass
  var options = {}
  if (self.agentOptions) {
    for (var i in self.agentOptions) {
      options[i] = self.agentOptions[i]
    }
  }
  if (self.ca) {
    options.ca = self.ca
  }
  if (self.ciphers) {
    options.ciphers = self.ciphers
  }
  if (self.secureProtocol) {
    options.secureProtocol = self.secureProtocol
  }
  if (self.secureOptions) {
    options.secureOptions = self.secureOptions
  }
  if (typeof self.rejectUnauthorized !== 'undefined') {
    options.rejectUnauthorized = self.rejectUnauthorized
  }

  if (self.cert && self.key) {
    options.key = self.key
    options.cert = self.cert
  }

  if (self.pfx) {
    options.pfx = self.pfx
  }

  if (self.passphrase) {
    options.passphrase = self.passphrase
  }

  var poolKey = ''

  // different types of agents are in different pools
  if (Agent !== self.httpModule.Agent) {
    poolKey += Agent.name
  }

  // ca option is only relevant if proxy or destination are https
  var proxy = self.proxy
  if (typeof proxy === 'string') {
    proxy = url.parse(proxy)
  }
  var isHttps = (proxy && proxy.protocol === 'https:') || this.uri.protocol === 'https:'

  if (isHttps) {
    if (options.ca) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.ca
    }

    if (typeof options.rejectUnauthorized !== 'undefined') {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.rejectUnauthorized
    }

    if (options.cert) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.cert.toString('ascii') + options.key.toString('ascii')
    }

    if (options.pfx) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.pfx.toString('ascii')
    }

    if (options.ciphers) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.ciphers
    }

    if (options.secureProtocol) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.secureProtocol
    }

    if (options.secureOptions) {
      if (poolKey) {
        poolKey += ':'
      }
      poolKey += options.secureOptions
    }
  }

  if (self.pool === globalPool && !poolKey && Object.keys(options).length === 0 && self.httpModule.globalAgent) {
    // not doing anything special.  Use the globalAgent
    return self.httpModule.globalAgent
  }

  // we're using a stored agent.  Make sure it's protocol-specific
  poolKey = self.uri.protocol + poolKey

  // generate a new agent for this setting if none yet exists
  if (!self.pool[poolKey]) {
    self.pool[poolKey] = new Agent(options)
    // properly set maxSockets on new agents
    if (self.pool.maxSockets) {
      self.pool[poolKey].maxSockets = self.pool.maxSockets
    }
  }

  return self.pool[poolKey]
}

Request.prototype.start = function () {
  console.log('request-------start-------begin--');
  // start() is called once we are ready to send the outgoing HTTP request.
  // this is usually called on the first write(), end() or on nextTick()
  var self = this

  if (self.timing) {//capture 捕获  calculate计算
    // 所有计时将相对于此请求的开始。 为了做到这一点,
    // 我们需要捕捉挂钟的开始时间 (通过日期), 紧接着
    // 由高分辨率计时器 (通过现在 ())。 虽然这两个不会被设置
    // 在 _exact_ 的同时, 他们应该足够接近, 能够计算
    // 相对于开始的高分辨率、单调递减时间戳。
    // All timings will be relative to this request's startTime.  In order to do this,
    // we need to capture the wall-clock start time (via Date), immediately followed
    // by the high-resolution timer (via now()).  While these two won't be set
    // at the _exact_ same time, they should be close enough to be able to calculate
    // high-resolution, monotonically non-decreasing timestamps relative to startTime.
    //常用的时间戳, 精确到毫秒;
    var startTime = new Date().getTime()
    //这个是更加精确的代码性能测试, 时间精度更高
    // 返回一个时间戳,以毫秒为单位,精确到千分之一毫秒
    var startTimeNow = now()
  }

  if (self._aborted) {
    return
  }

  self._started = true
  self.method = self.method || 'GET'
  self.href = self.uri.href

  if (self.src && self.src.stat && self.src.stat.size && !self.hasHeader('content-length')) {
    self.setHeader('content-length', self.src.stat.size)
  }
  if (self._aws) {
    self.aws(self._aws, true)
  }

  // We have a method named auth, which is completely different from the http.request
  // auth option.  If we don't remove it, we're gonna have a bad time.
  var reqOptions = copy(self)
  delete reqOptions.auth

  debug('make request', self.uri.href)

  // node v6.8.0 now supports a `timeout` value in `http.request()`, but we
  // should delete it for now since we handle timeouts manually for better
  // consistency with node versions before v6.8.0
  delete reqOptions.timeout
  // console.log('self.httpModule---+++++++',self.httpModule);
  try {
    console.log('---try httpModules request ---');
    //http.request(options[, callback])
    // console.log('reqOptions----',Object.keys(reqOptions));
    //options 可以是一个对象、或字符串、或 URL 对象。 如果 options 是一个字符串，它会被自动使用 url.parse() 解析。 
    // If it is a URL object, it will be automatically converted to an ordinary options object.
    //可选的 callback 参数会作为单次监听器被添加到 'response' 事件。

/***********************http.ClientRequest************************/
// http.ClientRequest
// 该对象在 http.request() 内部被创建并返回。 它表示着一个正在处理的请求，其请求头已进入队列。 
// 请求头仍可使用 setHeader(name, value)、getHeader(name) 和 removeHeader(name) API 进行修改。
//  实际的请求头会与第一个数据块一起发送或当关闭连接时发送。
// 要获取响应，需为 'response' 事件添加一个监听器到请求对象上。
//  当响应头被接收到时，'response' 事件会从请求对象上被触发 。

// 'response' 事件被执行时带有一个参数，该参数是一个 http.IncomingMessage 实例。
// 在 'response' 事件期间，可以添加监听器到响应对象上，比如监听 'data' 事件。
// 如果没有添加 'response' 事件处理函数，则响应会被整个丢弃。 
// 如果添加了 'response' 事件处理函数，则必须消耗完响应对象的数据，
//可通过调用 response.read()、或添加一个 'data' 事件处理函数、或调用 .resume() 方法。 
// 数据被消耗完时会触发 'end' 事件。 在数据被读取完之前会消耗内存，可能会造成 'process out of memory' 错误。

// http.request() 返回一个 http.ClientRequest 类的实例。 
// ClientRequest 实例是一个可写流。 如果需要通过 POST 请求上传一个文件，则写入到 ClientRequest 对象。
    self.req = self.httpModule.request(reqOptions)
  } catch (err) {
    self.emit('error', err)
    return
  }

  if (self.timing) {
    self.startTime = startTime
    self.startTimeNow = startTimeNow

    // Timing values will all be relative to startTime (by comparing to startTimeNow
    // so we have an accurate clock)
    self.timings = {}
  }

  var timeout
  if (self.timeout && !self.timeoutTimer) {
    if (self.timeout < 0) {
      timeout = 0
    } else if (typeof self.timeout === 'number' && isFinite(self.timeout)) {
      timeout = self.timeout
    }
  }
  // ------------- request------start------------ //
// options 可以是一个对象、或字符串、或 URL 对象。 如果 options 是一个字符串，它会被自动使用 url.parse() 解析。 
// If it is a URL object, it will be automatically converted to an ordinary options object.
// 可选的 callback 参数会作为单次监听器被添加到 'response' 事件。
  self.req.on('response', self.onRequestResponse.bind(self))
  self.req.on('error', self.onRequestError.bind(self))
  self.req.on('drain', function() {
    self.emit('drain')
  })
//   http.ClientRequest 类#
// 新增于: v0.1.17
// 该对象在 http.request() 内部被创建并返回。 它表示着一个正在处理的请求，其请求头已进入队列。 请求头仍可使用 setHeader(name, value)、getHeader(name) 和 removeHeader(name) API 进行修改。 实际的请求头会与第一个数据块一起发送或当关闭连接时发送。
// 要获取响应，需为 'response' 事件添加一个监听器到请求对象上。 当响应头被接收到时，'response' 事件会从请求对象上被触发 。 'response' 事件被执行时带有一个参数，该参数是一个 http.IncomingMessage 实例。
  
  // 当 socket 被分配到请求后触发
  //这个对socket的监听,做了些处理, 对普通的请求,暂未有用
  //Socket的英文原义是“孔”或“插座”Socket非常类似于电话插座。
  // HTTP是轿车，提供了封装或者显示数据的具体形式；Socket是发动机，提供了网络通信的能力。
  self.req.on('socket', function(socket) {
    console.log('http req socket ------callback--------'); //scoket 进入tcp一层
    // `._connecting` was the old property which was made public in node v6.1.0
    var isConnecting = socket._connecting || socket.connecting
    console.log('socket---connecting---',isConnecting , self.timing); //true
    if (self.timing) {
      console.log('self.timing---------',self.timing);
      self.timings.socket = now() - self.startTimeNow

      if (isConnecting) {
        var onLookupTiming = function() {
          self.timings.lookup = now() - self.startTimeNow
        }

        var onConnectTiming = function() {
          self.timings.connect = now() - self.startTimeNow
        }
        // 为指定事件注册一个单次监听器，即 监听器最多只会触发一次，触发后立刻解除该监听器。
        socket.once('lookup', onLookupTiming)
        socket.once('connect', onConnectTiming)

        // clean up timing event listeners if needed on error
        self.req.once('error', function() {
          socket.removeListener('lookup', onLookupTiming)
          socket.removeListener('connect', onConnectTiming)
        })
      }
    }

    console.log('before setReqTimeout--------------');

    var setReqTimeout = function() {
      console.log('---setReqTimeout-------');
//  此超时设置等待的时间量 * 发送的字节数
// 从服务器连接后。
// 特别是, 如果服务器无法发送 erroring, 它将非常有用
// 通过流传输响应的中途数据。
      // This timeout sets the amount of time to wait *between* bytes sent
      // from the server once connected.
      //
      // In particular, it's useful for erroring if the server fails to send
      // data halfway through streaming a response.
      // request.setTimeout(timeout[, callback])#
      // 新增于: v0.5.9
      // timeout <number> 请求被认为是超时的毫秒数。
      // callback <Function> 可选的函数，当超时发生时被调用。等同于绑定到 timeout 事件。
      /*********特别注意下面这句话******/ // 个人理解是 传输时间超时
      // 一旦 socket 被分配给请求且已连接，socket.setTimeout() 会被调用。
      self.req.setTimeout(timeout, function () {
        if (self.req) {
          // request.abort()
          // 新增于: v0.3.8
          // 标记请求为终止。 调用该方法将使响应中剩余的数据被丢弃且 socket 被销毁。
          self.abort()// 这里出发self.req self.response abort();
          var e = new Error('ESOCKETTIMEDOUT')
          e.code = 'ESOCKETTIMEDOUT'
          e.connect = false
          self.emit('error', e)
        }
      })
    }

    if (timeout !== undefined) {
      // Only start the connection timer if we're actually connecting a new
      // socket, otherwise if we're already connected (because this is a
      // keep-alive connection) do not bother. This is important since we won't
      // get a 'connect' event for an already connected socket.
      if (isConnecting) {
        var onReqSockConnect = function() {
          //在这里清除timeout--, 这样就不会触发timeout;
          // 1503385867584  这个时间是下面这行代码得到的
          // 1503385867591  这个是服务器端server  Received a request 得到, 相差无几,
          console.log('-------------onReqSockConnect-------connect---',new Date().getTime());
          socket.removeListener('connect', onReqSockConnect)
          //这是socket层已经链接上了, 清除clearTimeout,
          // 这时options.timeout已经没有用了,
          //然后用了, self.req.setTimeout() 就是socket time out,
          //即服务器并没有在http 层做出响应;
          clearTimeout(self.timeoutTimer)
          self.timeoutTimer = null
          setReqTimeout()
        }

        var socketEnd = function () {
          console.log('----socket--------End-----');
        }

        var socketTimeOut = function () {
          console.log('----socket--------timeout  event-----');
        }

        // socket.setTimeout(100);
        socket.on('connect', onReqSockConnect);
        socket.on('timeout', socketTimeOut);
        socket.on('end', socketEnd)

        self.req.on('error', function(err) {
          socket.removeListener('connect', onReqSockConnect)
        })
        console.log('-------timeout----------');
        // Set a timeout in memory - this block will throw if the server takes more
        // than `timeout` to write the HTTP status and headers (corresponding to
        // the on('response') event on the client). NB: this measures wall-clock
        // time, not the time between bytes sent by the server.
        self.timeoutTimer = setTimeout(function () {
         console.log(' timeoutTimer ----set', timeout);
          socket.removeListener('connect', onReqSockConnect)
          self.abort()
          var e = new Error('ETIMEDOUT')
          e.code = 'ETIMEDOUT'
          e.connect = true
          self.emit('error', e)
        }, timeout)

        console.log('after timeout-----timer');
      } else {
        // We're already connected
        setReqTimeout()
      }
    }
    // console.log('----------+++++++------self.emit(scoret---)---');
    //self.emit('socket', socket)  //这两行代码现在 并没有起作用, 并没有做 监听 self.on('socket');
  }) // 都是在 req.scoket 回调中
// console.log('----------+++++++------self.emit(request)---');
  // self.emit('request', self.req)
  console.log('request-----start-------end-------');
}

Request.prototype.onRequestError = function (error) {
  var self = this
  if (self._aborted) {
    return
  }
  console.log('onRequestError-----', error);
  console.log('req._reusedSocket--',self.req._reusedSocket);//重用socket
  //add request no reuse 不再重新使用
  console.log('agent.addRequestNoruse--',self.agent.addRequestNoreuse);//
  console.log('error code---', error.code);

  if (self.req && self.req._reusedSocket && error.code === 'ECONNRESET'
      && self.agent.addRequestNoreuse) {
    console.log('---------scoket connection reset by peer--对方复位链接');
    self.agent = { addRequest: self.agent.addRequestNoreuse.bind(self.agent) }
    self.start()//重新请求;
    self.req.end()
    return
  }
  console.log('-++++++++++-onRequestError---++++++++++++++++');

  if (self.timeout && self.timeoutTimer) {
    clearTimeout(self.timeoutTimer)
    self.timeoutTimer = null
  }
  console.log('---------onRequestError-----------------');
  self.emit('error', error)
}

Request.prototype.onRequestResponse = function (response) {
  console.log("-780----self.req.on('response', self.onRequestResponse.bind(self)---作为http.request(options,callback)--中的callback-")

  var self = this
  // console.log(self.timeoutTimer);
// time- 如果true，请求 - 响应周期（包括所有重定向）以毫秒分辨率计时。设置时，以下属性将添加到响应对象中
// options.time = true => self.timing = true;
// if (options.time) { //这是init 中部的设置,
//     self.timing = true
// 定时；调速；时间选择
  if (self.timing) {
    //时间控制；时间安排；[计量] 计时（timing的复 timings
    self.timings.response = now() - self.startTimeNow
  }

  debug('onRequestResponse', self.uri.href, response.statusCode, response.headers)
  console.log('onRequestResponse----self.timing--',self.timing , 'self.timings-:',self.timings);
  //该方法会通知服务器，所有响应头和响应主体都已被发送，即服务器将其视为已完成。
   // 每次响应都必须调用 response.end() 方法。
  response.on('end', function() {
    console.log('response--------end---call-back--response.on--')
    if (self.timing) {
      self.timings.end = now() - self.startTimeNow
      response.timingStart = self.startTime

      // fill in the blanks for any periods that didn't trigger, such as
      // no lookup or connect due to keep alive
      if (!self.timings.socket) {
        self.timings.socket = 0
      }
      if (!self.timings.lookup) {
        self.timings.lookup = self.timings.socket
      }
      if (!self.timings.connect) {
        self.timings.connect = self.timings.lookup
      }
      if (!self.timings.response) {
        self.timings.response = self.timings.connect
      }

      debug('elapsed time', self.timings.end)

      // elapsedTime includes all redirects
      self.elapsedTime += Math.round(self.timings.end)

      // NOTE: elapsedTime is deprecated in favor of .timings
      response.elapsedTime = self.elapsedTime

      // timings is just for the final fetch
      response.timings = self.timings

      // pre-calculate phase timings as well
      response.timingPhases = {
        wait: self.timings.socket,
        dns: self.timings.lookup - self.timings.socket,
        tcp: self.timings.connect - self.timings.lookup,
        firstByte: self.timings.response - self.timings.connect,
        download: self.timings.end - self.timings.response,
        total: self.timings.end
      }
    }


    debug('response end', self.uri.href, response.statusCode, response.headers)
  })

  console.log('++++++++++++++++++++++++++++=---------onrequestresponse---');
  if (self._aborted) {
    debug('aborted', self.uri.href)
    response.resume()
    return
  }

  self.response = response
  response.request = self
  response.toJSON = responseToJSON

  // XXX This is different on 0.10, because SSL is strict by default
  if (self.httpModule === https &&
      self.strictSSL && (!response.hasOwnProperty('socket') ||
      !response.socket.authorized)) {
    debug('strict ssl error', self.uri.href)
    var sslErr = response.hasOwnProperty('socket') ? response.socket.authorizationError : self.uri.href + ' does not support SSL'
    self.emit('error', new Error('SSL Error: ' + sslErr))
    return
  }

  // Save the original host before any redirect (if it changes, we need to
  // remove any authorization headers).  Also remember the case of the header
  // name because lots of broken servers expect Host instead of host and we
  // want the caller to be able to specify this.
  self.originalHost = self.getHeader('host')
  if (!self.originalHostHeaderName) {
    self.originalHostHeaderName = self.hasHeader('host')
  }
  if (self.setHost) {
    self.removeHeader('host')
  }
  console.log('before  onRequestResponse---timeout-------',self.timeout, self.timeoutTimer);
  if (self.timeout && self.timeoutTimer) {
    console.log('onRequestResponse-----clearTimeout----');
    clearTimeout(self.timeoutTimer)
    self.timeoutTimer = null
  }

  var targetCookieJar = (self._jar && self._jar.setCookie) ? self._jar : globalCookieJar
  var addCookie = function (cookie) {
    console.log('addCookie----',cookie);
    //set the cookie if it's domain in the href's domain.
    try {
      targetCookieJar.setCookie(cookie, self.uri.href, {ignoreError: true})
    } catch (e) {
      self.emit('error', e)
    }
  }
  console.log('response---headers---',response.headers);
  response.caseless = caseless(response.headers)
  // console.log('case less response---',response.caseless);
  console.log('self _disableCookies---',self._disableCookies);

  if (response.caseless.has('set-cookie') && (!self._disableCookies)) {
    var headerName = response.caseless.has('set-cookie'); //has some key return this key;
    console.log('cookie headerName---', headerName);
    if (Array.isArray(response.headers[headerName])) {
      response.headers[headerName].forEach(addCookie)
    } else {
      addCookie(response.headers[headerName])
    }
  }

  if (self._redirect.onResponse(response)) {
    return // Ignore the rest of the response
  } else {
    // Be a good stream and emit end when the response is finished.
    // Hack to emit end on close because of a core bug that never fires end
    response.on('close', function () {
      console.log('response----close---event--', new Date().getTime());
      if (!self._ended) {
        self.response.emit('end')
      }
    })

    response.once('end', function () {
      console.log('response----once end------change _ended =true');
      self._ended = true
    })

    var noBody = function (code) {
      return (
        self.method === 'HEAD'
        // Informational
        || (code >= 100 && code < 200)
        // No Content
        || code === 204
        // Not Modified
        || code === 304
      )
    }
    console.log('main----controler -----response------------');
    var responseContent
    if (self.gzip && !noBody(response.statusCode)) {
      var contentEncoding = response.headers['content-encoding'] || 'identity'
      contentEncoding = contentEncoding.trim().toLowerCase()

      // Be more lenient with decoding compressed responses, since (very rarely)
      // servers send slightly invalid gzip responses that are still accepted
      // by common browsers.
      // Always using Z_SYNC_FLUSH is what cURL does.
      var zlibOptions = {
        flush: zlib.Z_SYNC_FLUSH
      , finishFlush: zlib.Z_SYNC_FLUSH
      }

      if (contentEncoding === 'gzip') {
        responseContent = zlib.createGunzip(zlibOptions)
        response.pipe(responseContent)
      } else if (contentEncoding === 'deflate') {
        responseContent = zlib.createInflate(zlibOptions)
        response.pipe(responseContent)
      } else {
        // Since previous versions didn't check for Content-Encoding header,
        // ignore any invalid values to preserve backwards-compatibility
        if (contentEncoding !== 'identity') {
          debug('ignoring unrecognized Content-Encoding ' + contentEncoding)
        }
        responseContent = response
      }
    } else {
      responseContent = response
    }

    if (self.encoding) {
      if (self.dests.length !== 0) {
        console.error('Ignoring encoding parameter as this stream is being piped to another stream which makes the encoding option invalid.')
      } else if (responseContent.setEncoding) {
        responseContent.setEncoding(self.encoding)
      } else {
        // Should only occur on node pre-v0.9.4 (joyent/node@9b5abe5) with
        // zlib streams.
        // If/When support for 0.9.4 is dropped, this should be unnecessary.
        responseContent = responseContent.pipe(stringstream(self.encoding))
      }
    }

    if (self._paused) {
      responseContent.pause()
    }

    self.responseContent = responseContent
    console.log('self.emit ---- response------');
    self.emit('response', response)

    self.dests.forEach(function (dest) {
      self.pipeDest(dest)
    })

    responseContent.on('data', function (chunk) {
      if (self.timing && !self.responseStarted) {
        self.responseStartTime = (new Date()).getTime()

        // NOTE: responseStartTime is deprecated in favor of .timings
        response.responseStartTime = self.responseStartTime
      }
      self._destdata = true
      self.emit('data', chunk)
    })
// 以上例子中，emitter 为事件 someEvent 注册了两个事件监听器，然后触发了 someEvent 事件。
// 运行结果中可以看到两个事件监听器回调函数被先后调用。 这就是EventEmitter最简单的用法。
    responseContent.once('end', function (chunk) {
      console.log('responseContent---once----end----');
      console.log('self emit "end event"------');
      self.emit('end', chunk)
    })
    responseContent.on('error', function (error) {
      self.emit('error', error)
    })
    responseContent.on('close', function () {self.emit('close')})

    if (self.callback) {
      console.log('self call  readResponseBody-----', typeof response);
      self.readResponseBody(response)
    }
    //if no callback
    else {
      self.on('end', function () {
        if (self._aborted) {
          debug('aborted', self.uri.href)
          return
        }
        self.emit('complete', response)
      })
    }
  }
  debug('finish init function', self.uri.href)
}

Request.prototype.readResponseBody = function (response) {
  var self = this
  debug('reading response\'s body---------')
  var buffers = []
    , bufferLength = 0
    , strings = []

  self.on('data', function (chunk) {
    console.log('isBuffer----', Buffer.isBuffer(chunk));
    if (!Buffer.isBuffer(chunk)) {
      console.log('string-----chunk',chunk);
      strings.push(chunk)
    } else if (chunk.length) {
      bufferLength += chunk.length
      buffers.push(chunk)
    }
  })
  self.on('end', function () {
    debug('end event', self.uri.href)
    if (self._aborted) {
      debug('aborted', self.uri.href)
      // `buffer` is defined in the parent scope and used in a closure it exists for the life of the request.
      // This can lead to leaky behavior if the user retains a reference to the request object.
      buffers = []
      bufferLength = 0
      return
    }

    if (bufferLength) {
      debug('has body', self.uri.href, bufferLength)
      response.body = Buffer.concat(buffers, bufferLength)
      if (self.encoding !== null) {
        console.log('buffer------to _.isString--------');
        response.body = response.body.toString(self.encoding)
      }
      // `buffer` is defined in the parent scope and used in a closure it exists for the life of the Request.
      // This can lead to leaky behavior if the user retains a reference to the request object.
      buffers = []
      bufferLength = 0
    } else if (strings.length) {
      // The UTF8 BOM [0xEF,0xBB,0xBF] is converted to [0xFE,0xFF] in the JS UTC16/UCS2 representation.
      // Strip this value out when the encoding is set to 'utf8', as upstream consumers won't expect it and it breaks JSON.parse().
      if (self.encoding === 'utf8' && strings[0].length > 0 && strings[0][0] === '\uFEFF') {
        strings[0] = strings[0].substring(1)
      }
      console.log('strings length-------',strings.length);
      response.body = strings.join('')
    }

    if (self._json) {
      try {
        response.body = JSON.parse(response.body, self._jsonReviver)
      } catch (e) {
        debug('invalid JSON received', self.uri.href)
      }
    }
    debug('emitting complete', self.uri.href)
    if (typeof response.body === 'undefined' && !self._json) {
      response.body = self.encoding === null ? Buffer.alloc(0) : ''
    }
    //* bind 是返回对应函数，便于稍后调用；apply 、call 则是立即调用 。
    // self.on('error', self.callback.bind()) //参见 200行, init 中 ;
    // self.on('complete', self.callback.bind(self, null))
    //同样bind也可以有多个参数，并且参数可以执行的时候再次添加，但是要注意的是，参数是按照形参的顺序进行的
    //上面的 null ,就是 callback 中的 error, 参数 可以bind的时候添加, 也可以调用的时候添加;但要按顺序;
    self.emit('complete', response, response.body)
  })
}

Request.prototype.abort = function () {
  var self = this
  self._aborted = true

  if (self.req) {
    self.req.abort()
  }
  else if (self.response) {
    self.response.destroy() //破坏
  }

  self.emit('abort')
}

Request.prototype.pipeDest = function (dest) {
  var self = this
  var response = self.response
  // Called after the response is received
  if (dest.headers && !dest.headersSent) {
    if (response.caseless.has('content-type')) {
      var ctname = response.caseless.has('content-type')
      if (dest.setHeader) {
        dest.setHeader(ctname, response.headers[ctname])
      }
      else {
        dest.headers[ctname] = response.headers[ctname]
      }
    }

    if (response.caseless.has('content-length')) {
      var clname = response.caseless.has('content-length')
      if (dest.setHeader) {
        dest.setHeader(clname, response.headers[clname])
      } else {
        dest.headers[clname] = response.headers[clname]
      }
    }
  }
  if (dest.setHeader && !dest.headersSent) {
    for (var i in response.headers) {
      // If the response content is being decoded, the Content-Encoding header
      // of the response doesn't represent the piped content, so don't pass it.
      if (!self.gzip || i !== 'content-encoding') {
        dest.setHeader(i, response.headers[i])
      }
    }
    dest.statusCode = response.statusCode
  }
  if (self.pipefilter) {
    self.pipefilter(response, dest)
  }
}

Request.prototype.qs = function (q, clobber) {
  var self = this
  var base
  if (!clobber && self.uri.query) {
    base = self._qs.parse(self.uri.query)
  } else {
    base = {}
  }

  for (var i in q) {
    base[i] = q[i]
  }

  var qs = self._qs.stringify(base)

  if (qs === '') {
    return self
  }

  self.uri = url.parse(self.uri.href.split('?')[0] + '?' + qs)
  self.url = self.uri
  self.path = self.uri.path

  if (self.uri.host === 'unix') {
    self.enableUnixSocket()
  }

  return self
}
Request.prototype.form = function (form) {
  var self = this
  if (form) {
    if (!/^application\/x-www-form-urlencoded\b/.test(self.getHeader('content-type'))) {
      self.setHeader('content-type', 'application/x-www-form-urlencoded')
    }
    self.body = (typeof form === 'string')
      ? self._qs.rfc3986(form.toString('utf8'))
      : self._qs.stringify(form).toString('utf8')
    return self
  }
  // create form-data object
  self._form = new FormData()
  self._form.on('error', function(err) {
    err.message = 'form-data: ' + err.message
    self.emit('error', err)
    self.abort()
  })
  return self._form
}
Request.prototype.multipart = function (multipart) {
  var self = this

  self._multipart.onRequest(multipart)

  if (!self._multipart.chunked) {
    self.body = self._multipart.body
  }

  return self
}
Request.prototype.json = function (val) {
  var self = this

  if (!self.hasHeader('accept')) {
    self.setHeader('accept', 'application/json')
  }

  if (typeof self.jsonReplacer === 'function') {
    self._jsonReplacer = self.jsonReplacer
  }

  self._json = true
  if (typeof val === 'boolean') {
    if (self.body !== undefined) {
      if (!/^application\/x-www-form-urlencoded\b/.test(self.getHeader('content-type'))) {
        self.body = safeStringify(self.body, self._jsonReplacer)
      } else {
        self.body = self._qs.rfc3986(self.body)
      }
      if (!self.hasHeader('content-type')) {
        self.setHeader('content-type', 'application/json')
      }
    }
  } else {
    self.body = safeStringify(val, self._jsonReplacer)
    if (!self.hasHeader('content-type')) {
      self.setHeader('content-type', 'application/json')
    }
  }

  if (typeof self.jsonReviver === 'function') {
    self._jsonReviver = self.jsonReviver
  }

  return self
}
Request.prototype.getHeader = function (name, headers) {
  var self = this
  var result, re, match
  if (!headers) {
    headers = self.headers
  }
  Object.keys(headers).forEach(function (key) {
    if (key.length !== name.length) {
      return
    }
    re = new RegExp(name, 'i')
    match = key.match(re)
    if (match) {
      result = headers[key]
    }
  })
  return result
}
Request.prototype.enableUnixSocket = function () {
  // Get the socket & request paths from the URL
  var unixParts = this.uri.path.split(':')
    , host = unixParts[0]
    , path = unixParts[1]
  // Apply unix properties to request
  this.socketPath = host
  this.uri.pathname = path
  this.uri.path = path
  this.uri.host = host
  this.uri.hostname = host
  this.uri.isUnix = true
}


Request.prototype.auth = function (user, pass, sendImmediately, bearer) {
  var self = this

  self._auth.onRequest(user, pass, sendImmediately, bearer)

  return self
}
Request.prototype.aws = function (opts, now) {
  var self = this

  if (!now) {
    self._aws = opts
    return self
  }

  if (opts.sign_version == 4 || opts.sign_version == '4') {
    // use aws4
    var options = {
      host: self.uri.host,
      path: self.uri.path,
      method: self.method,
      headers: {
        'content-type': self.getHeader('content-type') || ''
      },
      body: self.body
    }
    var signRes = aws4.sign(options, {
      accessKeyId: opts.key,
      secretAccessKey: opts.secret,
      sessionToken: opts.session
    })
    self.setHeader('authorization', signRes.headers.Authorization)
    self.setHeader('x-amz-date', signRes.headers['X-Amz-Date'])
    if (signRes.headers['X-Amz-Security-Token']) {
      self.setHeader('x-amz-security-token', signRes.headers['X-Amz-Security-Token'])
    }
  }
  else {
    // default: use aws-sign2
    var date = new Date()
    self.setHeader('date', date.toUTCString())
    var auth =
      { key: opts.key
      , secret: opts.secret
      , verb: self.method.toUpperCase()
      , date: date
      , contentType: self.getHeader('content-type') || ''
      , md5: self.getHeader('content-md5') || ''
      , amazonHeaders: aws2.canonicalizeHeaders(self.headers)
      }
    var path = self.uri.path
    if (opts.bucket && path) {
      auth.resource = '/' + opts.bucket + path
    } else if (opts.bucket && !path) {
      auth.resource = '/' + opts.bucket
    } else if (!opts.bucket && path) {
      auth.resource = path
    } else if (!opts.bucket && !path) {
      auth.resource = '/'
    }
    auth.resource = aws2.canonicalizeResource(auth.resource)
    self.setHeader('authorization', aws2.authorization(auth))
  }

  return self
}
Request.prototype.httpSignature = function (opts) {
  var self = this
  httpSignature.signRequest({
    getHeader: function(header) {
      return self.getHeader(header, self.headers)
    },
    setHeader: function(header, value) {
      self.setHeader(header, value)
    },
    method: self.method,
    path: self.path
  }, opts)
  debug('httpSignature authorization', self.getHeader('authorization'))

  return self
}
Request.prototype.hawk = function (opts) {
  var self = this
  self.setHeader('Authorization', hawk.client.header(self.uri, self.method, opts).field)
}
Request.prototype.oauth = function (_oauth) {
  var self = this

  self._oauth.onRequest(_oauth)

  return self
}

Request.prototype.jar = function (jar) {
  var self = this
  var cookies

  if (self._redirect.redirectsFollowed === 0) {
    self.originalCookieHeader = self.getHeader('cookie')
  }

  if (!jar) {
    // disable cookies
    cookies = false
    self._disableCookies = true
  } else {
    var targetCookieJar = (jar && jar.getCookieString) ? jar : globalCookieJar
    var urihref = self.uri.href
    //fetch cookie in the Specified host
    if (targetCookieJar) {
      cookies = targetCookieJar.getCookieString(urihref)
    }
  }

  //if need cookie and cookie is not empty
  if (cookies && cookies.length) {
    if (self.originalCookieHeader) {
      // Don't overwrite existing Cookie header
      self.setHeader('cookie', self.originalCookieHeader + '; ' + cookies)
    } else {
      self.setHeader('cookie', cookies)
    }
  }
  self._jar = jar
  return self
}


// Stream API
Request.prototype.pipe = function (dest, opts) {
  var self = this

  if (self.response) {
    if (self._destdata) {
      self.emit('error', new Error('You cannot pipe after data has been emitted from the response.'))
    } else if (self._ended) {
      self.emit('error', new Error('You cannot pipe after the response has been ended.'))
    } else {
      stream.Stream.prototype.pipe.call(self, dest, opts)
      self.pipeDest(dest)
      return dest
    }
  } else {
    self.dests.push(dest)
    stream.Stream.prototype.pipe.call(self, dest, opts)
    return dest
  }
}
Request.prototype.write = function () {
  var self = this
  if (self._aborted) {return}

  if (!self._started) {
    self.start()
  }
  if (self.req) {
    return self.req.write.apply(self.req, arguments)
  }
}
Request.prototype.end = function (chunk) {
  console.log('request---prototype----end----');
  var self = this
  if (self._aborted) {return}

  if (chunk) {
    self.write(chunk)
  }
  console.log(self.req);
  if (!self._started) {
    console.log('request---prototype----!self._started');
    self.start()
  }
  if (self.req) {
    self.req.end()
  }
}
Request.prototype.pause = function () {

  var self = this
  if (!self.responseContent) {
    self._paused = true
  } else {
    self.responseContent.pause.apply(self.responseContent, arguments)
  }
}
Request.prototype.resume = function () {
  var self = this
  if (!self.responseContent) {
    self._paused = false
  } else {
    self.responseContent.resume.apply(self.responseContent, arguments)
  }
}
Request.prototype.destroy = function () {
  var self = this
  if (!self._ended) {
    self.end()
  } else if (self.response) {
    self.response.destroy()
  }
}

Request.defaultProxyHeaderWhiteList =
  Tunnel.defaultProxyHeaderWhiteList.slice()

Request.defaultProxyHeaderExclusiveList =
  Tunnel.defaultProxyHeaderExclusiveList.slice()

// Exports

Request.prototype.toJSON = requestToJSON
module.exports = Request


 // ------callback-------- Socket {
 //  connecting: true,
 //  _hadError: false,
 //  _handle: 
 //   TCP {
 //     bytesRead: 0,
 //     _externalStream: {},
 //     fd: -1,
 //     reading: false,
 //     owner: [Circular],
 //     onread: [Function: onread],
 //     onconnection: null,
 //     writeQueueSize: 0 },
 //  _parent: null,
 //  _host: 'www.baidu.com',
 //  _readableState: 
 //   ReadableState {
 //     objectMode: false,
 //     highWaterMark: 16384,
 //     buffer: BufferList { head: null, tail: null, length: 0 },
 //     length: 0,
 //     pipes: null,
 //     pipesCount: 0,
 //     flowing: true,
 //     ended: false,
 //     endEmitted: false,
 //     reading: false,
 //     sync: true,
 //     needReadable: false,
 //     emittedReadable: false,
 //     readableListening: false,
 //     resumeScheduled: true,
 //     defaultEncoding: 'utf8',
 //     ranOut: false,
 //     awaitDrain: 0,
 //     readingMore: false,
 //     decoder: null,
 //     encoding: null },
 //  readable: false,
 //  domain: null,
 //  _events: 
 //   { end: [ [Object], [Function: socketOnEnd] ],
 //     finish: [Function: onSocketFinish],
 //     _socketEnd: [Function: onSocketEnd],
 //     connect: [ [Object], [Object] ],
 //     free: [Function: onFree],
 //     close: [ [Function: onClose], [Function: socketCloseListener] ],
 //     agentRemove: [Function: onRemove],
 //     drain: [Function: ondrain],
 //     error: [Function: socketErrorListener],
 //     data: [Function: socketOnData] },
 //  _eventsCount: 10,
 //  _maxListeners: undefined,
 //  _writableState: 
 //   WritableState {
 //     objectMode: false,
 //     highWaterMark: 16384,
 //     needDrain: false,
 //     ending: false,
 //     ended: false,
 //     finished: false,
 //     decodeStrings: false,
 //     defaultEncoding: 'utf8',
 //     length: 98,
 //     writing: true,
 //     corked: 0,
 //     sync: false,
 //     bufferProcessing: false,
 //     onwrite: [Function],
 //     writecb: [Function: finish],
 //     writelen: 98,
 //     bufferedRequest: null,
 //     lastBufferedRequest: null,
 //     pendingcb: 1,
 //     prefinished: false,
 //     errorEmitted: false,
 //     bufferedRequestCount: 0,
 //     corkedRequestsFree: CorkedRequest { next: null, entry: null, finish: [Function] } },
 //  writable: true,
 //  allowHalfOpen: false,
 //  destroyed: false,
 //  _bytesDispatched: 0,
 //  _sockname: null,
 //  _pendingData: 'GET / HTTP/1.1\r\n0: [object Object]\r\n1: [object Object]\r\nhost: www.baidu.com\r\nConnection: close\r\n\r\n',
 //  _pendingEncoding: 'latin1',
 //  server: null,
 //  _server: null,
 //  parser: 
 //   HTTPParser {
 //     '0': [Function: parserOnHeaders],
 //     '1': [Function: parserOnHeadersComplete],
 //     '2': [Function: parserOnBody],
 //     '3': [Function: parserOnMessageComplete],
 //     '4': null,
 //     _headers: [],
 //     _url: '',
 //     _consumed: false,
 //     socket: [Circular],
 //     incoming: null,
 //     outgoing: 
 //      ClientRequest {
 //        domain: null,
 //        _events: [Object],
 //        _eventsCount: 4,
 //        _maxListeners: undefined,
 //        output: [],
 //        outputEncodings: [],
 //        outputCallbacks: [],
 //        outputSize: 0,
 //        writable: true,
 //        _last: true,
 //        upgrading: false,
 //        chunkedEncoding: false,
 //        shouldKeepAlive: false,
 //        useChunkedEncodingByDefault: false,
 //        sendDate: false,
 //        _removedHeader: {},
 //        _contentLength: 0,
 //        _hasBody: true,
 //        _trailer: '',
 //        finished: true,
 //        _headerSent: true,
 //        socket: [Circular],
 //        connection: [Circular],
 //        _header: 'GET / HTTP/1.1\r\n0: [object Object]\r\n1: [object Object]\r\nhost: www.baidu.com\r\nConnection: close\r\n\r\n',
 //        _headers: [Object],
 //        _headerNames: [Object],
 //        _onPendingData: null,
 //        agent: [Object],
 //        socketPath: undefined,
 //        timeout: undefined,
 //        method: 'GET',
 //        path: '/',
 //        _ended: false,
 //        parser: [Circular] },
 //     maxHeaderPairs: 2000,
 //     onIncoming: [Function: parserOnIncomingClient] },
 //  _httpMessage: 
 //   ClientRequest {
 //     domain: null,
 //     _events: 
 //      { socket: [Object],
 //        response: [Function: bound ],
 //        error: [Function: bound ],
 //        drain: [Function] },
 //     _eventsCount: 4,
 //     _maxListeners: undefined,
 //     output: [],
 //     outputEncodings: [],
 //     outputCallbacks: [],
 //     outputSize: 0,
 //     writable: true,
 //     _last: true,
 //     upgrading: false,
 //     chunkedEncoding: false,
 //     shouldKeepAlive: false,
 //     useChunkedEncodingByDefault: false,
 //     sendDate: false,
 //     _removedHeader: {},
 //     _contentLength: 0,
 //     _hasBody: true,
 //     _trailer: '',
 //     finished: true,
 //     _headerSent: true,
 //     socket: [Circular],
 //     connection: [Circular],
 //     _header: 'GET / HTTP/1.1\r\n0: [object Object]\r\n1: [object Object]\r\nhost: www.baidu.com\r\nConnection: close\r\n\r\n',
 //     _headers: { '0': [Object], '1': [Object], host: 'www.baidu.com' },
 //     _headerNames: { '0': '0', '1': '1', host: 'host' },
 //     _onPendingData: null,
 //     agent: 
 //      Agent {
 //        domain: null,
 //        _events: [Object],
 //        _eventsCount: 1,
 //        _maxListeners: undefined,
 //        defaultPort: 80,
 //        protocol: 'http:',
 //        options: [Object],
 //        requests: {},
 //        sockets: [Object],
 //        freeSockets: {},
 //        keepAliveMsecs: 1000,
 //        keepAlive: false,
 //        maxSockets: Infinity,
 //        maxFreeSockets: 256 },
 //     socketPath: undefined,
 //     timeout: undefined,
 //     method: 'GET',
 //     path: '/',
 //     _ended: false,
 //     parser: 
 //      HTTPParser {
 //        '0': [Function: parserOnHeaders],
 //        '1': [Function: parserOnHeadersComplete],
 //        '2': [Function: parserOnBody],
 //        '3': [Function: parserOnMessageComplete],
 //        '4': null,
 //        _headers: [],
 //        _url: '',
 //        _consumed: false,
 //        socket: [Circular],
 //        incoming: null,
 //        outgoing: [Circular],
 //        maxHeaderPairs: 2000,
 //        onIncoming: [Function: parserOnIncomingClient] } } }

