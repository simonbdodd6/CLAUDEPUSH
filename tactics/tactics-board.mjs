var pv = Object.defineProperty;
var hv = (e, t, n) => t in e ? pv(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n }) : e[t] = n;
var Va = (e, t, n) => hv(e, typeof t != "symbol" ? t + "" : t, n);
var lh = { exports: {} }, da = {}, uh = { exports: {} }, te = {};
/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var ys = Symbol.for("react.element"), mv = Symbol.for("react.portal"), yv = Symbol.for("react.fragment"), gv = Symbol.for("react.strict_mode"), vv = Symbol.for("react.profiler"), xv = Symbol.for("react.provider"), wv = Symbol.for("react.context"), kv = Symbol.for("react.forward_ref"), Sv = Symbol.for("react.suspense"), bv = Symbol.for("react.memo"), _v = Symbol.for("react.lazy"), Md = Symbol.iterator;
function Cv(e) {
  return e === null || typeof e != "object" ? null : (e = Md && e[Md] || e["@@iterator"], typeof e == "function" ? e : null);
}
var ch = { isMounted: function() {
  return !1;
}, enqueueForceUpdate: function() {
}, enqueueReplaceState: function() {
}, enqueueSetState: function() {
} }, dh = Object.assign, fh = {};
function ao(e, t, n) {
  this.props = e, this.context = t, this.refs = fh, this.updater = n || ch;
}
ao.prototype.isReactComponent = {};
ao.prototype.setState = function(e, t) {
  if (typeof e != "object" && typeof e != "function" && e != null) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
  this.updater.enqueueSetState(this, e, t, "setState");
};
ao.prototype.forceUpdate = function(e) {
  this.updater.enqueueForceUpdate(this, e, "forceUpdate");
};
function ph() {
}
ph.prototype = ao.prototype;
function Ju(e, t, n) {
  this.props = e, this.context = t, this.refs = fh, this.updater = n || ch;
}
var qu = Ju.prototype = new ph();
qu.constructor = Ju;
dh(qu, ao.prototype);
qu.isPureReactComponent = !0;
var Rd = Array.isArray, hh = Object.prototype.hasOwnProperty, ec = { current: null }, mh = { key: !0, ref: !0, __self: !0, __source: !0 };
function yh(e, t, n) {
  var r, o = {}, s = null, i = null;
  if (t != null) for (r in t.ref !== void 0 && (i = t.ref), t.key !== void 0 && (s = "" + t.key), t) hh.call(t, r) && !mh.hasOwnProperty(r) && (o[r] = t[r]);
  var a = arguments.length - 2;
  if (a === 1) o.children = n;
  else if (1 < a) {
    for (var l = Array(a), u = 0; u < a; u++) l[u] = arguments[u + 2];
    o.children = l;
  }
  if (e && e.defaultProps) for (r in a = e.defaultProps, a) o[r] === void 0 && (o[r] = a[r]);
  return { $$typeof: ys, type: e, key: s, ref: i, props: o, _owner: ec.current };
}
function Ev(e, t) {
  return { $$typeof: ys, type: e.type, key: t, ref: e.ref, props: e.props, _owner: e._owner };
}
function tc(e) {
  return typeof e == "object" && e !== null && e.$$typeof === ys;
}
function jv(e) {
  var t = { "=": "=0", ":": "=2" };
  return "$" + e.replace(/[=:]/g, function(n) {
    return t[n];
  });
}
var Dd = /\/+/g;
function Ua(e, t) {
  return typeof e == "object" && e !== null && e.key != null ? jv("" + e.key) : t.toString(36);
}
function Xs(e, t, n, r, o) {
  var s = typeof e;
  (s === "undefined" || s === "boolean") && (e = null);
  var i = !1;
  if (e === null) i = !0;
  else switch (s) {
    case "string":
    case "number":
      i = !0;
      break;
    case "object":
      switch (e.$$typeof) {
        case ys:
        case mv:
          i = !0;
      }
  }
  if (i) return i = e, o = o(i), e = r === "" ? "." + Ua(i, 0) : r, Rd(o) ? (n = "", e != null && (n = e.replace(Dd, "$&/") + "/"), Xs(o, t, n, "", function(u) {
    return u;
  })) : o != null && (tc(o) && (o = Ev(o, n + (!o.key || i && i.key === o.key ? "" : ("" + o.key).replace(Dd, "$&/") + "/") + e)), t.push(o)), 1;
  if (i = 0, r = r === "" ? "." : r + ":", Rd(e)) for (var a = 0; a < e.length; a++) {
    s = e[a];
    var l = r + Ua(s, a);
    i += Xs(s, t, n, l, o);
  }
  else if (l = Cv(e), typeof l == "function") for (e = l.call(e), a = 0; !(s = e.next()).done; ) s = s.value, l = r + Ua(s, a++), i += Xs(s, t, n, l, o);
  else if (s === "object") throw t = String(e), Error("Objects are not valid as a React child (found: " + (t === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : t) + "). If you meant to render a collection of children, use an array instead.");
  return i;
}
function js(e, t, n) {
  if (e == null) return e;
  var r = [], o = 0;
  return Xs(e, r, "", "", function(s) {
    return t.call(n, s, o++);
  }), r;
}
function $v(e) {
  if (e._status === -1) {
    var t = e._result;
    t = t(), t.then(function(n) {
      (e._status === 0 || e._status === -1) && (e._status = 1, e._result = n);
    }, function(n) {
      (e._status === 0 || e._status === -1) && (e._status = 2, e._result = n);
    }), e._status === -1 && (e._status = 0, e._result = t);
  }
  if (e._status === 1) return e._result.default;
  throw e._result;
}
var Xe = { current: null }, Js = { transition: null }, Iv = { ReactCurrentDispatcher: Xe, ReactCurrentBatchConfig: Js, ReactCurrentOwner: ec };
function gh() {
  throw Error("act(...) is not supported in production builds of React.");
}
te.Children = { map: js, forEach: function(e, t, n) {
  js(e, function() {
    t.apply(this, arguments);
  }, n);
}, count: function(e) {
  var t = 0;
  return js(e, function() {
    t++;
  }), t;
}, toArray: function(e) {
  return js(e, function(t) {
    return t;
  }) || [];
}, only: function(e) {
  if (!tc(e)) throw Error("React.Children.only expected to receive a single React element child.");
  return e;
} };
te.Component = ao;
te.Fragment = yv;
te.Profiler = vv;
te.PureComponent = Ju;
te.StrictMode = gv;
te.Suspense = Sv;
te.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Iv;
te.act = gh;
te.cloneElement = function(e, t, n) {
  if (e == null) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + e + ".");
  var r = dh({}, e.props), o = e.key, s = e.ref, i = e._owner;
  if (t != null) {
    if (t.ref !== void 0 && (s = t.ref, i = ec.current), t.key !== void 0 && (o = "" + t.key), e.type && e.type.defaultProps) var a = e.type.defaultProps;
    for (l in t) hh.call(t, l) && !mh.hasOwnProperty(l) && (r[l] = t[l] === void 0 && a !== void 0 ? a[l] : t[l]);
  }
  var l = arguments.length - 2;
  if (l === 1) r.children = n;
  else if (1 < l) {
    a = Array(l);
    for (var u = 0; u < l; u++) a[u] = arguments[u + 2];
    r.children = a;
  }
  return { $$typeof: ys, type: e.type, key: o, ref: s, props: r, _owner: i };
};
te.createContext = function(e) {
  return e = { $$typeof: wv, _currentValue: e, _currentValue2: e, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null }, e.Provider = { $$typeof: xv, _context: e }, e.Consumer = e;
};
te.createElement = yh;
te.createFactory = function(e) {
  var t = yh.bind(null, e);
  return t.type = e, t;
};
te.createRef = function() {
  return { current: null };
};
te.forwardRef = function(e) {
  return { $$typeof: kv, render: e };
};
te.isValidElement = tc;
te.lazy = function(e) {
  return { $$typeof: _v, _payload: { _status: -1, _result: e }, _init: $v };
};
te.memo = function(e, t) {
  return { $$typeof: bv, type: e, compare: t === void 0 ? null : t };
};
te.startTransition = function(e) {
  var t = Js.transition;
  Js.transition = {};
  try {
    e();
  } finally {
    Js.transition = t;
  }
};
te.unstable_act = gh;
te.useCallback = function(e, t) {
  return Xe.current.useCallback(e, t);
};
te.useContext = function(e) {
  return Xe.current.useContext(e);
};
te.useDebugValue = function() {
};
te.useDeferredValue = function(e) {
  return Xe.current.useDeferredValue(e);
};
te.useEffect = function(e, t) {
  return Xe.current.useEffect(e, t);
};
te.useId = function() {
  return Xe.current.useId();
};
te.useImperativeHandle = function(e, t, n) {
  return Xe.current.useImperativeHandle(e, t, n);
};
te.useInsertionEffect = function(e, t) {
  return Xe.current.useInsertionEffect(e, t);
};
te.useLayoutEffect = function(e, t) {
  return Xe.current.useLayoutEffect(e, t);
};
te.useMemo = function(e, t) {
  return Xe.current.useMemo(e, t);
};
te.useReducer = function(e, t, n) {
  return Xe.current.useReducer(e, t, n);
};
te.useRef = function(e) {
  return Xe.current.useRef(e);
};
te.useState = function(e) {
  return Xe.current.useState(e);
};
te.useSyncExternalStore = function(e, t, n) {
  return Xe.current.useSyncExternalStore(e, t, n);
};
te.useTransition = function() {
  return Xe.current.useTransition();
};
te.version = "18.3.1";
uh.exports = te;
var $ = uh.exports;
/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Tv = $, Nv = Symbol.for("react.element"), Ov = Symbol.for("react.fragment"), Pv = Object.prototype.hasOwnProperty, Mv = Tv.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, Rv = { key: !0, ref: !0, __self: !0, __source: !0 };
function vh(e, t, n) {
  var r, o = {}, s = null, i = null;
  n !== void 0 && (s = "" + n), t.key !== void 0 && (s = "" + t.key), t.ref !== void 0 && (i = t.ref);
  for (r in t) Pv.call(t, r) && !Rv.hasOwnProperty(r) && (o[r] = t[r]);
  if (e && e.defaultProps) for (r in t = e.defaultProps, t) o[r] === void 0 && (o[r] = t[r]);
  return { $$typeof: Nv, type: e, key: s, ref: i, props: o, _owner: Mv.current };
}
da.Fragment = Ov;
da.jsx = vh;
da.jsxs = vh;
lh.exports = da;
var d = lh.exports, xh = { exports: {} }, bt = {}, wh = { exports: {} }, kh = {};
/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
(function(e) {
  function t(N, V) {
    var U = N.length;
    N.push(V);
    e: for (; 0 < U; ) {
      var ae = U - 1 >>> 1, le = N[ae];
      if (0 < o(le, V)) N[ae] = V, N[U] = le, U = ae;
      else break e;
    }
  }
  function n(N) {
    return N.length === 0 ? null : N[0];
  }
  function r(N) {
    if (N.length === 0) return null;
    var V = N[0], U = N.pop();
    if (U !== V) {
      N[0] = U;
      e: for (var ae = 0, le = N.length, ue = le >>> 1; ae < ue; ) {
        var Wt = 2 * (ae + 1) - 1, Er = N[Wt], Ct = Wt + 1, qn = N[Ct];
        if (0 > o(Er, U)) Ct < le && 0 > o(qn, Er) ? (N[ae] = qn, N[Ct] = U, ae = Ct) : (N[ae] = Er, N[Wt] = U, ae = Wt);
        else if (Ct < le && 0 > o(qn, U)) N[ae] = qn, N[Ct] = U, ae = Ct;
        else break e;
      }
    }
    return V;
  }
  function o(N, V) {
    var U = N.sortIndex - V.sortIndex;
    return U !== 0 ? U : N.id - V.id;
  }
  if (typeof performance == "object" && typeof performance.now == "function") {
    var s = performance;
    e.unstable_now = function() {
      return s.now();
    };
  } else {
    var i = Date, a = i.now();
    e.unstable_now = function() {
      return i.now() - a;
    };
  }
  var l = [], u = [], c = 1, p = null, g = 3, w = !1, x = !1, k = !1, b = typeof setTimeout == "function" ? setTimeout : null, v = typeof clearTimeout == "function" ? clearTimeout : null, f = typeof setImmediate < "u" ? setImmediate : null;
  typeof navigator < "u" && navigator.scheduling !== void 0 && navigator.scheduling.isInputPending !== void 0 && navigator.scheduling.isInputPending.bind(navigator.scheduling);
  function m(N) {
    for (var V = n(u); V !== null; ) {
      if (V.callback === null) r(u);
      else if (V.startTime <= N) r(u), V.sortIndex = V.expirationTime, t(l, V);
      else break;
      V = n(u);
    }
  }
  function S(N) {
    if (k = !1, m(N), !x) if (n(l) !== null) x = !0, ct(_);
    else {
      var V = n(u);
      V !== null && Cr(S, V.startTime - N);
    }
  }
  function _(N, V) {
    x = !1, k && (k = !1, v(I), I = -1), w = !0;
    var U = g;
    try {
      for (m(V), p = n(l); p !== null && (!(p.expirationTime > V) || N && !_e()); ) {
        var ae = p.callback;
        if (typeof ae == "function") {
          p.callback = null, g = p.priorityLevel;
          var le = ae(p.expirationTime <= V);
          V = e.unstable_now(), typeof le == "function" ? p.callback = le : p === n(l) && r(l), m(V);
        } else r(l);
        p = n(l);
      }
      if (p !== null) var ue = !0;
      else {
        var Wt = n(u);
        Wt !== null && Cr(S, Wt.startTime - V), ue = !1;
      }
      return ue;
    } finally {
      p = null, g = U, w = !1;
    }
  }
  var T = !1, R = null, I = -1, Z = 5, B = -1;
  function _e() {
    return !(e.unstable_now() - B < Z);
  }
  function M() {
    if (R !== null) {
      var N = e.unstable_now();
      B = N;
      var V = !0;
      try {
        V = R(!0, N);
      } finally {
        V ? tt() : (T = !1, R = null);
      }
    } else T = !1;
  }
  var tt;
  if (typeof f == "function") tt = function() {
    f(M);
  };
  else if (typeof MessageChannel < "u") {
    var Jn = new MessageChannel(), ve = Jn.port2;
    Jn.port1.onmessage = M, tt = function() {
      ve.postMessage(null);
    };
  } else tt = function() {
    b(M, 0);
  };
  function ct(N) {
    R = N, T || (T = !0, tt());
  }
  function Cr(N, V) {
    I = b(function() {
      N(e.unstable_now());
    }, V);
  }
  e.unstable_IdlePriority = 5, e.unstable_ImmediatePriority = 1, e.unstable_LowPriority = 4, e.unstable_NormalPriority = 3, e.unstable_Profiling = null, e.unstable_UserBlockingPriority = 2, e.unstable_cancelCallback = function(N) {
    N.callback = null;
  }, e.unstable_continueExecution = function() {
    x || w || (x = !0, ct(_));
  }, e.unstable_forceFrameRate = function(N) {
    0 > N || 125 < N ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : Z = 0 < N ? Math.floor(1e3 / N) : 5;
  }, e.unstable_getCurrentPriorityLevel = function() {
    return g;
  }, e.unstable_getFirstCallbackNode = function() {
    return n(l);
  }, e.unstable_next = function(N) {
    switch (g) {
      case 1:
      case 2:
      case 3:
        var V = 3;
        break;
      default:
        V = g;
    }
    var U = g;
    g = V;
    try {
      return N();
    } finally {
      g = U;
    }
  }, e.unstable_pauseExecution = function() {
  }, e.unstable_requestPaint = function() {
  }, e.unstable_runWithPriority = function(N, V) {
    switch (N) {
      case 1:
      case 2:
      case 3:
      case 4:
      case 5:
        break;
      default:
        N = 3;
    }
    var U = g;
    g = N;
    try {
      return V();
    } finally {
      g = U;
    }
  }, e.unstable_scheduleCallback = function(N, V, U) {
    var ae = e.unstable_now();
    switch (typeof U == "object" && U !== null ? (U = U.delay, U = typeof U == "number" && 0 < U ? ae + U : ae) : U = ae, N) {
      case 1:
        var le = -1;
        break;
      case 2:
        le = 250;
        break;
      case 5:
        le = 1073741823;
        break;
      case 4:
        le = 1e4;
        break;
      default:
        le = 5e3;
    }
    return le = U + le, N = { id: c++, callback: V, priorityLevel: N, startTime: U, expirationTime: le, sortIndex: -1 }, U > ae ? (N.sortIndex = U, t(u, N), n(l) === null && N === n(u) && (k ? (v(I), I = -1) : k = !0, Cr(S, U - ae))) : (N.sortIndex = le, t(l, N), x || w || (x = !0, ct(_))), N;
  }, e.unstable_shouldYield = _e, e.unstable_wrapCallback = function(N) {
    var V = g;
    return function() {
      var U = g;
      g = V;
      try {
        return N.apply(this, arguments);
      } finally {
        g = U;
      }
    };
  };
})(kh);
wh.exports = kh;
var Dv = wh.exports;
/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var zv = $, St = Dv;
function E(e) {
  for (var t = "https://reactjs.org/docs/error-decoder.html?invariant=" + e, n = 1; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
  return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
}
var Sh = /* @__PURE__ */ new Set(), Qo = {};
function br(e, t) {
  Xr(e, t), Xr(e + "Capture", t);
}
function Xr(e, t) {
  for (Qo[e] = t, e = 0; e < t.length; e++) Sh.add(t[e]);
}
var hn = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Rl = Object.prototype.hasOwnProperty, Av = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/, zd = {}, Ad = {};
function Lv(e) {
  return Rl.call(Ad, e) ? !0 : Rl.call(zd, e) ? !1 : Av.test(e) ? Ad[e] = !0 : (zd[e] = !0, !1);
}
function Fv(e, t, n, r) {
  if (n !== null && n.type === 0) return !1;
  switch (typeof t) {
    case "function":
    case "symbol":
      return !0;
    case "boolean":
      return r ? !1 : n !== null ? !n.acceptsBooleans : (e = e.toLowerCase().slice(0, 5), e !== "data-" && e !== "aria-");
    default:
      return !1;
  }
}
function Bv(e, t, n, r) {
  if (t === null || typeof t > "u" || Fv(e, t, n, r)) return !0;
  if (r) return !1;
  if (n !== null) switch (n.type) {
    case 3:
      return !t;
    case 4:
      return t === !1;
    case 5:
      return isNaN(t);
    case 6:
      return isNaN(t) || 1 > t;
  }
  return !1;
}
function Je(e, t, n, r, o, s, i) {
  this.acceptsBooleans = t === 2 || t === 3 || t === 4, this.attributeName = r, this.attributeNamespace = o, this.mustUseProperty = n, this.propertyName = e, this.type = t, this.sanitizeURL = s, this.removeEmptyString = i;
}
var ze = {};
"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e) {
  ze[e] = new Je(e, 0, !1, e, null, !1, !1);
});
[["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(e) {
  var t = e[0];
  ze[t] = new Je(t, 1, !1, e[1], null, !1, !1);
});
["contentEditable", "draggable", "spellCheck", "value"].forEach(function(e) {
  ze[e] = new Je(e, 2, !1, e.toLowerCase(), null, !1, !1);
});
["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(e) {
  ze[e] = new Je(e, 2, !1, e, null, !1, !1);
});
"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e) {
  ze[e] = new Je(e, 3, !1, e.toLowerCase(), null, !1, !1);
});
["checked", "multiple", "muted", "selected"].forEach(function(e) {
  ze[e] = new Je(e, 3, !0, e, null, !1, !1);
});
["capture", "download"].forEach(function(e) {
  ze[e] = new Je(e, 4, !1, e, null, !1, !1);
});
["cols", "rows", "size", "span"].forEach(function(e) {
  ze[e] = new Je(e, 6, !1, e, null, !1, !1);
});
["rowSpan", "start"].forEach(function(e) {
  ze[e] = new Je(e, 5, !1, e.toLowerCase(), null, !1, !1);
});
var nc = /[\-:]([a-z])/g;
function rc(e) {
  return e[1].toUpperCase();
}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e) {
  var t = e.replace(
    nc,
    rc
  );
  ze[t] = new Je(t, 1, !1, e, null, !1, !1);
});
"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e) {
  var t = e.replace(nc, rc);
  ze[t] = new Je(t, 1, !1, e, "http://www.w3.org/1999/xlink", !1, !1);
});
["xml:base", "xml:lang", "xml:space"].forEach(function(e) {
  var t = e.replace(nc, rc);
  ze[t] = new Je(t, 1, !1, e, "http://www.w3.org/XML/1998/namespace", !1, !1);
});
["tabIndex", "crossOrigin"].forEach(function(e) {
  ze[e] = new Je(e, 1, !1, e.toLowerCase(), null, !1, !1);
});
ze.xlinkHref = new Je("xlinkHref", 1, !1, "xlink:href", "http://www.w3.org/1999/xlink", !0, !1);
["src", "href", "action", "formAction"].forEach(function(e) {
  ze[e] = new Je(e, 1, !1, e.toLowerCase(), null, !0, !0);
});
function oc(e, t, n, r) {
  var o = ze.hasOwnProperty(t) ? ze[t] : null;
  (o !== null ? o.type !== 0 : r || !(2 < t.length) || t[0] !== "o" && t[0] !== "O" || t[1] !== "n" && t[1] !== "N") && (Bv(t, n, o, r) && (n = null), r || o === null ? Lv(t) && (n === null ? e.removeAttribute(t) : e.setAttribute(t, "" + n)) : o.mustUseProperty ? e[o.propertyName] = n === null ? o.type === 3 ? !1 : "" : n : (t = o.attributeName, r = o.attributeNamespace, n === null ? e.removeAttribute(t) : (o = o.type, n = o === 3 || o === 4 && n === !0 ? "" : "" + n, r ? e.setAttributeNS(r, t, n) : e.setAttribute(t, n))));
}
var kn = zv.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED, $s = Symbol.for("react.element"), Pr = Symbol.for("react.portal"), Mr = Symbol.for("react.fragment"), sc = Symbol.for("react.strict_mode"), Dl = Symbol.for("react.profiler"), bh = Symbol.for("react.provider"), _h = Symbol.for("react.context"), ic = Symbol.for("react.forward_ref"), zl = Symbol.for("react.suspense"), Al = Symbol.for("react.suspense_list"), ac = Symbol.for("react.memo"), jn = Symbol.for("react.lazy"), Ch = Symbol.for("react.offscreen"), Ld = Symbol.iterator;
function yo(e) {
  return e === null || typeof e != "object" ? null : (e = Ld && e[Ld] || e["@@iterator"], typeof e == "function" ? e : null);
}
var Se = Object.assign, Wa;
function Co(e) {
  if (Wa === void 0) try {
    throw Error();
  } catch (n) {
    var t = n.stack.trim().match(/\n( *(at )?)/);
    Wa = t && t[1] || "";
  }
  return `
` + Wa + e;
}
var Ha = !1;
function Za(e, t) {
  if (!e || Ha) return "";
  Ha = !0;
  var n = Error.prepareStackTrace;
  Error.prepareStackTrace = void 0;
  try {
    if (t) if (t = function() {
      throw Error();
    }, Object.defineProperty(t.prototype, "props", { set: function() {
      throw Error();
    } }), typeof Reflect == "object" && Reflect.construct) {
      try {
        Reflect.construct(t, []);
      } catch (u) {
        var r = u;
      }
      Reflect.construct(e, [], t);
    } else {
      try {
        t.call();
      } catch (u) {
        r = u;
      }
      e.call(t.prototype);
    }
    else {
      try {
        throw Error();
      } catch (u) {
        r = u;
      }
      e();
    }
  } catch (u) {
    if (u && r && typeof u.stack == "string") {
      for (var o = u.stack.split(`
`), s = r.stack.split(`
`), i = o.length - 1, a = s.length - 1; 1 <= i && 0 <= a && o[i] !== s[a]; ) a--;
      for (; 1 <= i && 0 <= a; i--, a--) if (o[i] !== s[a]) {
        if (i !== 1 || a !== 1)
          do
            if (i--, a--, 0 > a || o[i] !== s[a]) {
              var l = `
` + o[i].replace(" at new ", " at ");
              return e.displayName && l.includes("<anonymous>") && (l = l.replace("<anonymous>", e.displayName)), l;
            }
          while (1 <= i && 0 <= a);
        break;
      }
    }
  } finally {
    Ha = !1, Error.prepareStackTrace = n;
  }
  return (e = e ? e.displayName || e.name : "") ? Co(e) : "";
}
function Vv(e) {
  switch (e.tag) {
    case 5:
      return Co(e.type);
    case 16:
      return Co("Lazy");
    case 13:
      return Co("Suspense");
    case 19:
      return Co("SuspenseList");
    case 0:
    case 2:
    case 15:
      return e = Za(e.type, !1), e;
    case 11:
      return e = Za(e.type.render, !1), e;
    case 1:
      return e = Za(e.type, !0), e;
    default:
      return "";
  }
}
function Ll(e) {
  if (e == null) return null;
  if (typeof e == "function") return e.displayName || e.name || null;
  if (typeof e == "string") return e;
  switch (e) {
    case Mr:
      return "Fragment";
    case Pr:
      return "Portal";
    case Dl:
      return "Profiler";
    case sc:
      return "StrictMode";
    case zl:
      return "Suspense";
    case Al:
      return "SuspenseList";
  }
  if (typeof e == "object") switch (e.$$typeof) {
    case _h:
      return (e.displayName || "Context") + ".Consumer";
    case bh:
      return (e._context.displayName || "Context") + ".Provider";
    case ic:
      var t = e.render;
      return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
    case ac:
      return t = e.displayName || null, t !== null ? t : Ll(e.type) || "Memo";
    case jn:
      t = e._payload, e = e._init;
      try {
        return Ll(e(t));
      } catch {
      }
  }
  return null;
}
function Uv(e) {
  var t = e.type;
  switch (e.tag) {
    case 24:
      return "Cache";
    case 9:
      return (t.displayName || "Context") + ".Consumer";
    case 10:
      return (t._context.displayName || "Context") + ".Provider";
    case 18:
      return "DehydratedFragment";
    case 11:
      return e = t.render, e = e.displayName || e.name || "", t.displayName || (e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef");
    case 7:
      return "Fragment";
    case 5:
      return t;
    case 4:
      return "Portal";
    case 3:
      return "Root";
    case 6:
      return "Text";
    case 16:
      return Ll(t);
    case 8:
      return t === sc ? "StrictMode" : "Mode";
    case 22:
      return "Offscreen";
    case 12:
      return "Profiler";
    case 21:
      return "Scope";
    case 13:
      return "Suspense";
    case 19:
      return "SuspenseList";
    case 25:
      return "TracingMarker";
    case 1:
    case 0:
    case 17:
    case 2:
    case 14:
    case 15:
      if (typeof t == "function") return t.displayName || t.name || null;
      if (typeof t == "string") return t;
  }
  return null;
}
function Hn(e) {
  switch (typeof e) {
    case "boolean":
    case "number":
    case "string":
    case "undefined":
      return e;
    case "object":
      return e;
    default:
      return "";
  }
}
function Eh(e) {
  var t = e.type;
  return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
}
function Wv(e) {
  var t = Eh(e) ? "checked" : "value", n = Object.getOwnPropertyDescriptor(e.constructor.prototype, t), r = "" + e[t];
  if (!e.hasOwnProperty(t) && typeof n < "u" && typeof n.get == "function" && typeof n.set == "function") {
    var o = n.get, s = n.set;
    return Object.defineProperty(e, t, { configurable: !0, get: function() {
      return o.call(this);
    }, set: function(i) {
      r = "" + i, s.call(this, i);
    } }), Object.defineProperty(e, t, { enumerable: n.enumerable }), { getValue: function() {
      return r;
    }, setValue: function(i) {
      r = "" + i;
    }, stopTracking: function() {
      e._valueTracker = null, delete e[t];
    } };
  }
}
function Is(e) {
  e._valueTracker || (e._valueTracker = Wv(e));
}
function jh(e) {
  if (!e) return !1;
  var t = e._valueTracker;
  if (!t) return !0;
  var n = t.getValue(), r = "";
  return e && (r = Eh(e) ? e.checked ? "true" : "false" : e.value), e = r, e !== n ? (t.setValue(e), !0) : !1;
}
function ki(e) {
  if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
  try {
    return e.activeElement || e.body;
  } catch {
    return e.body;
  }
}
function Fl(e, t) {
  var n = t.checked;
  return Se({}, t, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: n ?? e._wrapperState.initialChecked });
}
function Fd(e, t) {
  var n = t.defaultValue == null ? "" : t.defaultValue, r = t.checked != null ? t.checked : t.defaultChecked;
  n = Hn(t.value != null ? t.value : n), e._wrapperState = { initialChecked: r, initialValue: n, controlled: t.type === "checkbox" || t.type === "radio" ? t.checked != null : t.value != null };
}
function $h(e, t) {
  t = t.checked, t != null && oc(e, "checked", t, !1);
}
function Bl(e, t) {
  $h(e, t);
  var n = Hn(t.value), r = t.type;
  if (n != null) r === "number" ? (n === 0 && e.value === "" || e.value != n) && (e.value = "" + n) : e.value !== "" + n && (e.value = "" + n);
  else if (r === "submit" || r === "reset") {
    e.removeAttribute("value");
    return;
  }
  t.hasOwnProperty("value") ? Vl(e, t.type, n) : t.hasOwnProperty("defaultValue") && Vl(e, t.type, Hn(t.defaultValue)), t.checked == null && t.defaultChecked != null && (e.defaultChecked = !!t.defaultChecked);
}
function Bd(e, t, n) {
  if (t.hasOwnProperty("value") || t.hasOwnProperty("defaultValue")) {
    var r = t.type;
    if (!(r !== "submit" && r !== "reset" || t.value !== void 0 && t.value !== null)) return;
    t = "" + e._wrapperState.initialValue, n || t === e.value || (e.value = t), e.defaultValue = t;
  }
  n = e.name, n !== "" && (e.name = ""), e.defaultChecked = !!e._wrapperState.initialChecked, n !== "" && (e.name = n);
}
function Vl(e, t, n) {
  (t !== "number" || ki(e.ownerDocument) !== e) && (n == null ? e.defaultValue = "" + e._wrapperState.initialValue : e.defaultValue !== "" + n && (e.defaultValue = "" + n));
}
var Eo = Array.isArray;
function Hr(e, t, n, r) {
  if (e = e.options, t) {
    t = {};
    for (var o = 0; o < n.length; o++) t["$" + n[o]] = !0;
    for (n = 0; n < e.length; n++) o = t.hasOwnProperty("$" + e[n].value), e[n].selected !== o && (e[n].selected = o), o && r && (e[n].defaultSelected = !0);
  } else {
    for (n = "" + Hn(n), t = null, o = 0; o < e.length; o++) {
      if (e[o].value === n) {
        e[o].selected = !0, r && (e[o].defaultSelected = !0);
        return;
      }
      t !== null || e[o].disabled || (t = e[o]);
    }
    t !== null && (t.selected = !0);
  }
}
function Ul(e, t) {
  if (t.dangerouslySetInnerHTML != null) throw Error(E(91));
  return Se({}, t, { value: void 0, defaultValue: void 0, children: "" + e._wrapperState.initialValue });
}
function Vd(e, t) {
  var n = t.value;
  if (n == null) {
    if (n = t.children, t = t.defaultValue, n != null) {
      if (t != null) throw Error(E(92));
      if (Eo(n)) {
        if (1 < n.length) throw Error(E(93));
        n = n[0];
      }
      t = n;
    }
    t == null && (t = ""), n = t;
  }
  e._wrapperState = { initialValue: Hn(n) };
}
function Ih(e, t) {
  var n = Hn(t.value), r = Hn(t.defaultValue);
  n != null && (n = "" + n, n !== e.value && (e.value = n), t.defaultValue == null && e.defaultValue !== n && (e.defaultValue = n)), r != null && (e.defaultValue = "" + r);
}
function Ud(e) {
  var t = e.textContent;
  t === e._wrapperState.initialValue && t !== "" && t !== null && (e.value = t);
}
function Th(e) {
  switch (e) {
    case "svg":
      return "http://www.w3.org/2000/svg";
    case "math":
      return "http://www.w3.org/1998/Math/MathML";
    default:
      return "http://www.w3.org/1999/xhtml";
  }
}
function Wl(e, t) {
  return e == null || e === "http://www.w3.org/1999/xhtml" ? Th(t) : e === "http://www.w3.org/2000/svg" && t === "foreignObject" ? "http://www.w3.org/1999/xhtml" : e;
}
var Ts, Nh = function(e) {
  return typeof MSApp < "u" && MSApp.execUnsafeLocalFunction ? function(t, n, r, o) {
    MSApp.execUnsafeLocalFunction(function() {
      return e(t, n, r, o);
    });
  } : e;
}(function(e, t) {
  if (e.namespaceURI !== "http://www.w3.org/2000/svg" || "innerHTML" in e) e.innerHTML = t;
  else {
    for (Ts = Ts || document.createElement("div"), Ts.innerHTML = "<svg>" + t.valueOf().toString() + "</svg>", t = Ts.firstChild; e.firstChild; ) e.removeChild(e.firstChild);
    for (; t.firstChild; ) e.appendChild(t.firstChild);
  }
});
function Ko(e, t) {
  if (t) {
    var n = e.firstChild;
    if (n && n === e.lastChild && n.nodeType === 3) {
      n.nodeValue = t;
      return;
    }
  }
  e.textContent = t;
}
var Mo = {
  animationIterationCount: !0,
  aspectRatio: !0,
  borderImageOutset: !0,
  borderImageSlice: !0,
  borderImageWidth: !0,
  boxFlex: !0,
  boxFlexGroup: !0,
  boxOrdinalGroup: !0,
  columnCount: !0,
  columns: !0,
  flex: !0,
  flexGrow: !0,
  flexPositive: !0,
  flexShrink: !0,
  flexNegative: !0,
  flexOrder: !0,
  gridArea: !0,
  gridRow: !0,
  gridRowEnd: !0,
  gridRowSpan: !0,
  gridRowStart: !0,
  gridColumn: !0,
  gridColumnEnd: !0,
  gridColumnSpan: !0,
  gridColumnStart: !0,
  fontWeight: !0,
  lineClamp: !0,
  lineHeight: !0,
  opacity: !0,
  order: !0,
  orphans: !0,
  tabSize: !0,
  widows: !0,
  zIndex: !0,
  zoom: !0,
  fillOpacity: !0,
  floodOpacity: !0,
  stopOpacity: !0,
  strokeDasharray: !0,
  strokeDashoffset: !0,
  strokeMiterlimit: !0,
  strokeOpacity: !0,
  strokeWidth: !0
}, Hv = ["Webkit", "ms", "Moz", "O"];
Object.keys(Mo).forEach(function(e) {
  Hv.forEach(function(t) {
    t = t + e.charAt(0).toUpperCase() + e.substring(1), Mo[t] = Mo[e];
  });
});
function Oh(e, t, n) {
  return t == null || typeof t == "boolean" || t === "" ? "" : n || typeof t != "number" || t === 0 || Mo.hasOwnProperty(e) && Mo[e] ? ("" + t).trim() : t + "px";
}
function Ph(e, t) {
  e = e.style;
  for (var n in t) if (t.hasOwnProperty(n)) {
    var r = n.indexOf("--") === 0, o = Oh(n, t[n], r);
    n === "float" && (n = "cssFloat"), r ? e.setProperty(n, o) : e[n] = o;
  }
}
var Zv = Se({ menuitem: !0 }, { area: !0, base: !0, br: !0, col: !0, embed: !0, hr: !0, img: !0, input: !0, keygen: !0, link: !0, meta: !0, param: !0, source: !0, track: !0, wbr: !0 });
function Hl(e, t) {
  if (t) {
    if (Zv[e] && (t.children != null || t.dangerouslySetInnerHTML != null)) throw Error(E(137, e));
    if (t.dangerouslySetInnerHTML != null) {
      if (t.children != null) throw Error(E(60));
      if (typeof t.dangerouslySetInnerHTML != "object" || !("__html" in t.dangerouslySetInnerHTML)) throw Error(E(61));
    }
    if (t.style != null && typeof t.style != "object") throw Error(E(62));
  }
}
function Zl(e, t) {
  if (e.indexOf("-") === -1) return typeof t.is == "string";
  switch (e) {
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      return !1;
    default:
      return !0;
  }
}
var Ql = null;
function lc(e) {
  return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
}
var Kl = null, Zr = null, Qr = null;
function Wd(e) {
  if (e = xs(e)) {
    if (typeof Kl != "function") throw Error(E(280));
    var t = e.stateNode;
    t && (t = ya(t), Kl(e.stateNode, e.type, t));
  }
}
function Mh(e) {
  Zr ? Qr ? Qr.push(e) : Qr = [e] : Zr = e;
}
function Rh() {
  if (Zr) {
    var e = Zr, t = Qr;
    if (Qr = Zr = null, Wd(e), t) for (e = 0; e < t.length; e++) Wd(t[e]);
  }
}
function Dh(e, t) {
  return e(t);
}
function zh() {
}
var Qa = !1;
function Ah(e, t, n) {
  if (Qa) return e(t, n);
  Qa = !0;
  try {
    return Dh(e, t, n);
  } finally {
    Qa = !1, (Zr !== null || Qr !== null) && (zh(), Rh());
  }
}
function Yo(e, t) {
  var n = e.stateNode;
  if (n === null) return null;
  var r = ya(n);
  if (r === null) return null;
  n = r[t];
  e: switch (t) {
    case "onClick":
    case "onClickCapture":
    case "onDoubleClick":
    case "onDoubleClickCapture":
    case "onMouseDown":
    case "onMouseDownCapture":
    case "onMouseMove":
    case "onMouseMoveCapture":
    case "onMouseUp":
    case "onMouseUpCapture":
    case "onMouseEnter":
      (r = !r.disabled) || (e = e.type, r = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !r;
      break e;
    default:
      e = !1;
  }
  if (e) return null;
  if (n && typeof n != "function") throw Error(E(231, t, typeof n));
  return n;
}
var Yl = !1;
if (hn) try {
  var go = {};
  Object.defineProperty(go, "passive", { get: function() {
    Yl = !0;
  } }), window.addEventListener("test", go, go), window.removeEventListener("test", go, go);
} catch {
  Yl = !1;
}
function Qv(e, t, n, r, o, s, i, a, l) {
  var u = Array.prototype.slice.call(arguments, 3);
  try {
    t.apply(n, u);
  } catch (c) {
    this.onError(c);
  }
}
var Ro = !1, Si = null, bi = !1, Gl = null, Kv = { onError: function(e) {
  Ro = !0, Si = e;
} };
function Yv(e, t, n, r, o, s, i, a, l) {
  Ro = !1, Si = null, Qv.apply(Kv, arguments);
}
function Gv(e, t, n, r, o, s, i, a, l) {
  if (Yv.apply(this, arguments), Ro) {
    if (Ro) {
      var u = Si;
      Ro = !1, Si = null;
    } else throw Error(E(198));
    bi || (bi = !0, Gl = u);
  }
}
function _r(e) {
  var t = e, n = e;
  if (e.alternate) for (; t.return; ) t = t.return;
  else {
    e = t;
    do
      t = e, t.flags & 4098 && (n = t.return), e = t.return;
    while (e);
  }
  return t.tag === 3 ? n : null;
}
function Lh(e) {
  if (e.tag === 13) {
    var t = e.memoizedState;
    if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
  }
  return null;
}
function Hd(e) {
  if (_r(e) !== e) throw Error(E(188));
}
function Xv(e) {
  var t = e.alternate;
  if (!t) {
    if (t = _r(e), t === null) throw Error(E(188));
    return t !== e ? null : e;
  }
  for (var n = e, r = t; ; ) {
    var o = n.return;
    if (o === null) break;
    var s = o.alternate;
    if (s === null) {
      if (r = o.return, r !== null) {
        n = r;
        continue;
      }
      break;
    }
    if (o.child === s.child) {
      for (s = o.child; s; ) {
        if (s === n) return Hd(o), e;
        if (s === r) return Hd(o), t;
        s = s.sibling;
      }
      throw Error(E(188));
    }
    if (n.return !== r.return) n = o, r = s;
    else {
      for (var i = !1, a = o.child; a; ) {
        if (a === n) {
          i = !0, n = o, r = s;
          break;
        }
        if (a === r) {
          i = !0, r = o, n = s;
          break;
        }
        a = a.sibling;
      }
      if (!i) {
        for (a = s.child; a; ) {
          if (a === n) {
            i = !0, n = s, r = o;
            break;
          }
          if (a === r) {
            i = !0, r = s, n = o;
            break;
          }
          a = a.sibling;
        }
        if (!i) throw Error(E(189));
      }
    }
    if (n.alternate !== r) throw Error(E(190));
  }
  if (n.tag !== 3) throw Error(E(188));
  return n.stateNode.current === n ? e : t;
}
function Fh(e) {
  return e = Xv(e), e !== null ? Bh(e) : null;
}
function Bh(e) {
  if (e.tag === 5 || e.tag === 6) return e;
  for (e = e.child; e !== null; ) {
    var t = Bh(e);
    if (t !== null) return t;
    e = e.sibling;
  }
  return null;
}
var Vh = St.unstable_scheduleCallback, Zd = St.unstable_cancelCallback, Jv = St.unstable_shouldYield, qv = St.unstable_requestPaint, Ee = St.unstable_now, e0 = St.unstable_getCurrentPriorityLevel, uc = St.unstable_ImmediatePriority, Uh = St.unstable_UserBlockingPriority, _i = St.unstable_NormalPriority, t0 = St.unstable_LowPriority, Wh = St.unstable_IdlePriority, fa = null, en = null;
function n0(e) {
  if (en && typeof en.onCommitFiberRoot == "function") try {
    en.onCommitFiberRoot(fa, e, void 0, (e.current.flags & 128) === 128);
  } catch {
  }
}
var Ft = Math.clz32 ? Math.clz32 : s0, r0 = Math.log, o0 = Math.LN2;
function s0(e) {
  return e >>>= 0, e === 0 ? 32 : 31 - (r0(e) / o0 | 0) | 0;
}
var Ns = 64, Os = 4194304;
function jo(e) {
  switch (e & -e) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 4:
      return 4;
    case 8:
      return 8;
    case 16:
      return 16;
    case 32:
      return 32;
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return e & 4194240;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return e & 130023424;
    case 134217728:
      return 134217728;
    case 268435456:
      return 268435456;
    case 536870912:
      return 536870912;
    case 1073741824:
      return 1073741824;
    default:
      return e;
  }
}
function Ci(e, t) {
  var n = e.pendingLanes;
  if (n === 0) return 0;
  var r = 0, o = e.suspendedLanes, s = e.pingedLanes, i = n & 268435455;
  if (i !== 0) {
    var a = i & ~o;
    a !== 0 ? r = jo(a) : (s &= i, s !== 0 && (r = jo(s)));
  } else i = n & ~o, i !== 0 ? r = jo(i) : s !== 0 && (r = jo(s));
  if (r === 0) return 0;
  if (t !== 0 && t !== r && !(t & o) && (o = r & -r, s = t & -t, o >= s || o === 16 && (s & 4194240) !== 0)) return t;
  if (r & 4 && (r |= n & 16), t = e.entangledLanes, t !== 0) for (e = e.entanglements, t &= r; 0 < t; ) n = 31 - Ft(t), o = 1 << n, r |= e[n], t &= ~o;
  return r;
}
function i0(e, t) {
  switch (e) {
    case 1:
    case 2:
    case 4:
      return t + 250;
    case 8:
    case 16:
    case 32:
    case 64:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return t + 5e3;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
    case 67108864:
      return -1;
    case 134217728:
    case 268435456:
    case 536870912:
    case 1073741824:
      return -1;
    default:
      return -1;
  }
}
function a0(e, t) {
  for (var n = e.suspendedLanes, r = e.pingedLanes, o = e.expirationTimes, s = e.pendingLanes; 0 < s; ) {
    var i = 31 - Ft(s), a = 1 << i, l = o[i];
    l === -1 ? (!(a & n) || a & r) && (o[i] = i0(a, t)) : l <= t && (e.expiredLanes |= a), s &= ~a;
  }
}
function Xl(e) {
  return e = e.pendingLanes & -1073741825, e !== 0 ? e : e & 1073741824 ? 1073741824 : 0;
}
function Hh() {
  var e = Ns;
  return Ns <<= 1, !(Ns & 4194240) && (Ns = 64), e;
}
function Ka(e) {
  for (var t = [], n = 0; 31 > n; n++) t.push(e);
  return t;
}
function gs(e, t, n) {
  e.pendingLanes |= t, t !== 536870912 && (e.suspendedLanes = 0, e.pingedLanes = 0), e = e.eventTimes, t = 31 - Ft(t), e[t] = n;
}
function l0(e, t) {
  var n = e.pendingLanes & ~t;
  e.pendingLanes = t, e.suspendedLanes = 0, e.pingedLanes = 0, e.expiredLanes &= t, e.mutableReadLanes &= t, e.entangledLanes &= t, t = e.entanglements;
  var r = e.eventTimes;
  for (e = e.expirationTimes; 0 < n; ) {
    var o = 31 - Ft(n), s = 1 << o;
    t[o] = 0, r[o] = -1, e[o] = -1, n &= ~s;
  }
}
function cc(e, t) {
  var n = e.entangledLanes |= t;
  for (e = e.entanglements; n; ) {
    var r = 31 - Ft(n), o = 1 << r;
    o & t | e[r] & t && (e[r] |= t), n &= ~o;
  }
}
var ie = 0;
function Zh(e) {
  return e &= -e, 1 < e ? 4 < e ? e & 268435455 ? 16 : 536870912 : 4 : 1;
}
var Qh, dc, Kh, Yh, Gh, Jl = !1, Ps = [], zn = null, An = null, Ln = null, Go = /* @__PURE__ */ new Map(), Xo = /* @__PURE__ */ new Map(), Tn = [], u0 = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
function Qd(e, t) {
  switch (e) {
    case "focusin":
    case "focusout":
      zn = null;
      break;
    case "dragenter":
    case "dragleave":
      An = null;
      break;
    case "mouseover":
    case "mouseout":
      Ln = null;
      break;
    case "pointerover":
    case "pointerout":
      Go.delete(t.pointerId);
      break;
    case "gotpointercapture":
    case "lostpointercapture":
      Xo.delete(t.pointerId);
  }
}
function vo(e, t, n, r, o, s) {
  return e === null || e.nativeEvent !== s ? (e = { blockedOn: t, domEventName: n, eventSystemFlags: r, nativeEvent: s, targetContainers: [o] }, t !== null && (t = xs(t), t !== null && dc(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, o !== null && t.indexOf(o) === -1 && t.push(o), e);
}
function c0(e, t, n, r, o) {
  switch (t) {
    case "focusin":
      return zn = vo(zn, e, t, n, r, o), !0;
    case "dragenter":
      return An = vo(An, e, t, n, r, o), !0;
    case "mouseover":
      return Ln = vo(Ln, e, t, n, r, o), !0;
    case "pointerover":
      var s = o.pointerId;
      return Go.set(s, vo(Go.get(s) || null, e, t, n, r, o)), !0;
    case "gotpointercapture":
      return s = o.pointerId, Xo.set(s, vo(Xo.get(s) || null, e, t, n, r, o)), !0;
  }
  return !1;
}
function Xh(e) {
  var t = ir(e.target);
  if (t !== null) {
    var n = _r(t);
    if (n !== null) {
      if (t = n.tag, t === 13) {
        if (t = Lh(n), t !== null) {
          e.blockedOn = t, Gh(e.priority, function() {
            Kh(n);
          });
          return;
        }
      } else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
        e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
        return;
      }
    }
  }
  e.blockedOn = null;
}
function qs(e) {
  if (e.blockedOn !== null) return !1;
  for (var t = e.targetContainers; 0 < t.length; ) {
    var n = ql(e.domEventName, e.eventSystemFlags, t[0], e.nativeEvent);
    if (n === null) {
      n = e.nativeEvent;
      var r = new n.constructor(n.type, n);
      Ql = r, n.target.dispatchEvent(r), Ql = null;
    } else return t = xs(n), t !== null && dc(t), e.blockedOn = n, !1;
    t.shift();
  }
  return !0;
}
function Kd(e, t, n) {
  qs(e) && n.delete(t);
}
function d0() {
  Jl = !1, zn !== null && qs(zn) && (zn = null), An !== null && qs(An) && (An = null), Ln !== null && qs(Ln) && (Ln = null), Go.forEach(Kd), Xo.forEach(Kd);
}
function xo(e, t) {
  e.blockedOn === t && (e.blockedOn = null, Jl || (Jl = !0, St.unstable_scheduleCallback(St.unstable_NormalPriority, d0)));
}
function Jo(e) {
  function t(o) {
    return xo(o, e);
  }
  if (0 < Ps.length) {
    xo(Ps[0], e);
    for (var n = 1; n < Ps.length; n++) {
      var r = Ps[n];
      r.blockedOn === e && (r.blockedOn = null);
    }
  }
  for (zn !== null && xo(zn, e), An !== null && xo(An, e), Ln !== null && xo(Ln, e), Go.forEach(t), Xo.forEach(t), n = 0; n < Tn.length; n++) r = Tn[n], r.blockedOn === e && (r.blockedOn = null);
  for (; 0 < Tn.length && (n = Tn[0], n.blockedOn === null); ) Xh(n), n.blockedOn === null && Tn.shift();
}
var Kr = kn.ReactCurrentBatchConfig, Ei = !0;
function f0(e, t, n, r) {
  var o = ie, s = Kr.transition;
  Kr.transition = null;
  try {
    ie = 1, fc(e, t, n, r);
  } finally {
    ie = o, Kr.transition = s;
  }
}
function p0(e, t, n, r) {
  var o = ie, s = Kr.transition;
  Kr.transition = null;
  try {
    ie = 4, fc(e, t, n, r);
  } finally {
    ie = o, Kr.transition = s;
  }
}
function fc(e, t, n, r) {
  if (Ei) {
    var o = ql(e, t, n, r);
    if (o === null) ol(e, t, r, ji, n), Qd(e, r);
    else if (c0(o, e, t, n, r)) r.stopPropagation();
    else if (Qd(e, r), t & 4 && -1 < u0.indexOf(e)) {
      for (; o !== null; ) {
        var s = xs(o);
        if (s !== null && Qh(s), s = ql(e, t, n, r), s === null && ol(e, t, r, ji, n), s === o) break;
        o = s;
      }
      o !== null && r.stopPropagation();
    } else ol(e, t, r, null, n);
  }
}
var ji = null;
function ql(e, t, n, r) {
  if (ji = null, e = lc(r), e = ir(e), e !== null) if (t = _r(e), t === null) e = null;
  else if (n = t.tag, n === 13) {
    if (e = Lh(t), e !== null) return e;
    e = null;
  } else if (n === 3) {
    if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
    e = null;
  } else t !== e && (e = null);
  return ji = e, null;
}
function Jh(e) {
  switch (e) {
    case "cancel":
    case "click":
    case "close":
    case "contextmenu":
    case "copy":
    case "cut":
    case "auxclick":
    case "dblclick":
    case "dragend":
    case "dragstart":
    case "drop":
    case "focusin":
    case "focusout":
    case "input":
    case "invalid":
    case "keydown":
    case "keypress":
    case "keyup":
    case "mousedown":
    case "mouseup":
    case "paste":
    case "pause":
    case "play":
    case "pointercancel":
    case "pointerdown":
    case "pointerup":
    case "ratechange":
    case "reset":
    case "resize":
    case "seeked":
    case "submit":
    case "touchcancel":
    case "touchend":
    case "touchstart":
    case "volumechange":
    case "change":
    case "selectionchange":
    case "textInput":
    case "compositionstart":
    case "compositionend":
    case "compositionupdate":
    case "beforeblur":
    case "afterblur":
    case "beforeinput":
    case "blur":
    case "fullscreenchange":
    case "focus":
    case "hashchange":
    case "popstate":
    case "select":
    case "selectstart":
      return 1;
    case "drag":
    case "dragenter":
    case "dragexit":
    case "dragleave":
    case "dragover":
    case "mousemove":
    case "mouseout":
    case "mouseover":
    case "pointermove":
    case "pointerout":
    case "pointerover":
    case "scroll":
    case "toggle":
    case "touchmove":
    case "wheel":
    case "mouseenter":
    case "mouseleave":
    case "pointerenter":
    case "pointerleave":
      return 4;
    case "message":
      switch (e0()) {
        case uc:
          return 1;
        case Uh:
          return 4;
        case _i:
        case t0:
          return 16;
        case Wh:
          return 536870912;
        default:
          return 16;
      }
    default:
      return 16;
  }
}
var Pn = null, pc = null, ei = null;
function qh() {
  if (ei) return ei;
  var e, t = pc, n = t.length, r, o = "value" in Pn ? Pn.value : Pn.textContent, s = o.length;
  for (e = 0; e < n && t[e] === o[e]; e++) ;
  var i = n - e;
  for (r = 1; r <= i && t[n - r] === o[s - r]; r++) ;
  return ei = o.slice(e, 1 < r ? 1 - r : void 0);
}
function ti(e) {
  var t = e.keyCode;
  return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
}
function Ms() {
  return !0;
}
function Yd() {
  return !1;
}
function _t(e) {
  function t(n, r, o, s, i) {
    this._reactName = n, this._targetInst = o, this.type = r, this.nativeEvent = s, this.target = i, this.currentTarget = null;
    for (var a in e) e.hasOwnProperty(a) && (n = e[a], this[a] = n ? n(s) : s[a]);
    return this.isDefaultPrevented = (s.defaultPrevented != null ? s.defaultPrevented : s.returnValue === !1) ? Ms : Yd, this.isPropagationStopped = Yd, this;
  }
  return Se(t.prototype, { preventDefault: function() {
    this.defaultPrevented = !0;
    var n = this.nativeEvent;
    n && (n.preventDefault ? n.preventDefault() : typeof n.returnValue != "unknown" && (n.returnValue = !1), this.isDefaultPrevented = Ms);
  }, stopPropagation: function() {
    var n = this.nativeEvent;
    n && (n.stopPropagation ? n.stopPropagation() : typeof n.cancelBubble != "unknown" && (n.cancelBubble = !0), this.isPropagationStopped = Ms);
  }, persist: function() {
  }, isPersistent: Ms }), t;
}
var lo = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(e) {
  return e.timeStamp || Date.now();
}, defaultPrevented: 0, isTrusted: 0 }, hc = _t(lo), vs = Se({}, lo, { view: 0, detail: 0 }), h0 = _t(vs), Ya, Ga, wo, pa = Se({}, vs, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: mc, button: 0, buttons: 0, relatedTarget: function(e) {
  return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
}, movementX: function(e) {
  return "movementX" in e ? e.movementX : (e !== wo && (wo && e.type === "mousemove" ? (Ya = e.screenX - wo.screenX, Ga = e.screenY - wo.screenY) : Ga = Ya = 0, wo = e), Ya);
}, movementY: function(e) {
  return "movementY" in e ? e.movementY : Ga;
} }), Gd = _t(pa), m0 = Se({}, pa, { dataTransfer: 0 }), y0 = _t(m0), g0 = Se({}, vs, { relatedTarget: 0 }), Xa = _t(g0), v0 = Se({}, lo, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), x0 = _t(v0), w0 = Se({}, lo, { clipboardData: function(e) {
  return "clipboardData" in e ? e.clipboardData : window.clipboardData;
} }), k0 = _t(w0), S0 = Se({}, lo, { data: 0 }), Xd = _t(S0), b0 = {
  Esc: "Escape",
  Spacebar: " ",
  Left: "ArrowLeft",
  Up: "ArrowUp",
  Right: "ArrowRight",
  Down: "ArrowDown",
  Del: "Delete",
  Win: "OS",
  Menu: "ContextMenu",
  Apps: "ContextMenu",
  Scroll: "ScrollLock",
  MozPrintableKey: "Unidentified"
}, _0 = {
  8: "Backspace",
  9: "Tab",
  12: "Clear",
  13: "Enter",
  16: "Shift",
  17: "Control",
  18: "Alt",
  19: "Pause",
  20: "CapsLock",
  27: "Escape",
  32: " ",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  45: "Insert",
  46: "Delete",
  112: "F1",
  113: "F2",
  114: "F3",
  115: "F4",
  116: "F5",
  117: "F6",
  118: "F7",
  119: "F8",
  120: "F9",
  121: "F10",
  122: "F11",
  123: "F12",
  144: "NumLock",
  145: "ScrollLock",
  224: "Meta"
}, C0 = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
function E0(e) {
  var t = this.nativeEvent;
  return t.getModifierState ? t.getModifierState(e) : (e = C0[e]) ? !!t[e] : !1;
}
function mc() {
  return E0;
}
var j0 = Se({}, vs, { key: function(e) {
  if (e.key) {
    var t = b0[e.key] || e.key;
    if (t !== "Unidentified") return t;
  }
  return e.type === "keypress" ? (e = ti(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? _0[e.keyCode] || "Unidentified" : "";
}, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: mc, charCode: function(e) {
  return e.type === "keypress" ? ti(e) : 0;
}, keyCode: function(e) {
  return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
}, which: function(e) {
  return e.type === "keypress" ? ti(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
} }), $0 = _t(j0), I0 = Se({}, pa, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), Jd = _t(I0), T0 = Se({}, vs, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: mc }), N0 = _t(T0), O0 = Se({}, lo, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), P0 = _t(O0), M0 = Se({}, pa, {
  deltaX: function(e) {
    return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
  },
  deltaY: function(e) {
    return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
  },
  deltaZ: 0,
  deltaMode: 0
}), R0 = _t(M0), D0 = [9, 13, 27, 32], yc = hn && "CompositionEvent" in window, Do = null;
hn && "documentMode" in document && (Do = document.documentMode);
var z0 = hn && "TextEvent" in window && !Do, em = hn && (!yc || Do && 8 < Do && 11 >= Do), qd = " ", ef = !1;
function tm(e, t) {
  switch (e) {
    case "keyup":
      return D0.indexOf(t.keyCode) !== -1;
    case "keydown":
      return t.keyCode !== 229;
    case "keypress":
    case "mousedown":
    case "focusout":
      return !0;
    default:
      return !1;
  }
}
function nm(e) {
  return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
}
var Rr = !1;
function A0(e, t) {
  switch (e) {
    case "compositionend":
      return nm(t);
    case "keypress":
      return t.which !== 32 ? null : (ef = !0, qd);
    case "textInput":
      return e = t.data, e === qd && ef ? null : e;
    default:
      return null;
  }
}
function L0(e, t) {
  if (Rr) return e === "compositionend" || !yc && tm(e, t) ? (e = qh(), ei = pc = Pn = null, Rr = !1, e) : null;
  switch (e) {
    case "paste":
      return null;
    case "keypress":
      if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
        if (t.char && 1 < t.char.length) return t.char;
        if (t.which) return String.fromCharCode(t.which);
      }
      return null;
    case "compositionend":
      return em && t.locale !== "ko" ? null : t.data;
    default:
      return null;
  }
}
var F0 = { color: !0, date: !0, datetime: !0, "datetime-local": !0, email: !0, month: !0, number: !0, password: !0, range: !0, search: !0, tel: !0, text: !0, time: !0, url: !0, week: !0 };
function tf(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t === "input" ? !!F0[e.type] : t === "textarea";
}
function rm(e, t, n, r) {
  Mh(r), t = $i(t, "onChange"), 0 < t.length && (n = new hc("onChange", "change", null, n, r), e.push({ event: n, listeners: t }));
}
var zo = null, qo = null;
function B0(e) {
  hm(e, 0);
}
function ha(e) {
  var t = Ar(e);
  if (jh(t)) return e;
}
function V0(e, t) {
  if (e === "change") return t;
}
var om = !1;
if (hn) {
  var Ja;
  if (hn) {
    var qa = "oninput" in document;
    if (!qa) {
      var nf = document.createElement("div");
      nf.setAttribute("oninput", "return;"), qa = typeof nf.oninput == "function";
    }
    Ja = qa;
  } else Ja = !1;
  om = Ja && (!document.documentMode || 9 < document.documentMode);
}
function rf() {
  zo && (zo.detachEvent("onpropertychange", sm), qo = zo = null);
}
function sm(e) {
  if (e.propertyName === "value" && ha(qo)) {
    var t = [];
    rm(t, qo, e, lc(e)), Ah(B0, t);
  }
}
function U0(e, t, n) {
  e === "focusin" ? (rf(), zo = t, qo = n, zo.attachEvent("onpropertychange", sm)) : e === "focusout" && rf();
}
function W0(e) {
  if (e === "selectionchange" || e === "keyup" || e === "keydown") return ha(qo);
}
function H0(e, t) {
  if (e === "click") return ha(t);
}
function Z0(e, t) {
  if (e === "input" || e === "change") return ha(t);
}
function Q0(e, t) {
  return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
}
var Ut = typeof Object.is == "function" ? Object.is : Q0;
function es(e, t) {
  if (Ut(e, t)) return !0;
  if (typeof e != "object" || e === null || typeof t != "object" || t === null) return !1;
  var n = Object.keys(e), r = Object.keys(t);
  if (n.length !== r.length) return !1;
  for (r = 0; r < n.length; r++) {
    var o = n[r];
    if (!Rl.call(t, o) || !Ut(e[o], t[o])) return !1;
  }
  return !0;
}
function of(e) {
  for (; e && e.firstChild; ) e = e.firstChild;
  return e;
}
function sf(e, t) {
  var n = of(e);
  e = 0;
  for (var r; n; ) {
    if (n.nodeType === 3) {
      if (r = e + n.textContent.length, e <= t && r >= t) return { node: n, offset: t - e };
      e = r;
    }
    e: {
      for (; n; ) {
        if (n.nextSibling) {
          n = n.nextSibling;
          break e;
        }
        n = n.parentNode;
      }
      n = void 0;
    }
    n = of(n);
  }
}
function im(e, t) {
  return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? im(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
}
function am() {
  for (var e = window, t = ki(); t instanceof e.HTMLIFrameElement; ) {
    try {
      var n = typeof t.contentWindow.location.href == "string";
    } catch {
      n = !1;
    }
    if (n) e = t.contentWindow;
    else break;
    t = ki(e.document);
  }
  return t;
}
function gc(e) {
  var t = e && e.nodeName && e.nodeName.toLowerCase();
  return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
}
function K0(e) {
  var t = am(), n = e.focusedElem, r = e.selectionRange;
  if (t !== n && n && n.ownerDocument && im(n.ownerDocument.documentElement, n)) {
    if (r !== null && gc(n)) {
      if (t = r.start, e = r.end, e === void 0 && (e = t), "selectionStart" in n) n.selectionStart = t, n.selectionEnd = Math.min(e, n.value.length);
      else if (e = (t = n.ownerDocument || document) && t.defaultView || window, e.getSelection) {
        e = e.getSelection();
        var o = n.textContent.length, s = Math.min(r.start, o);
        r = r.end === void 0 ? s : Math.min(r.end, o), !e.extend && s > r && (o = r, r = s, s = o), o = sf(n, s);
        var i = sf(
          n,
          r
        );
        o && i && (e.rangeCount !== 1 || e.anchorNode !== o.node || e.anchorOffset !== o.offset || e.focusNode !== i.node || e.focusOffset !== i.offset) && (t = t.createRange(), t.setStart(o.node, o.offset), e.removeAllRanges(), s > r ? (e.addRange(t), e.extend(i.node, i.offset)) : (t.setEnd(i.node, i.offset), e.addRange(t)));
      }
    }
    for (t = [], e = n; e = e.parentNode; ) e.nodeType === 1 && t.push({ element: e, left: e.scrollLeft, top: e.scrollTop });
    for (typeof n.focus == "function" && n.focus(), n = 0; n < t.length; n++) e = t[n], e.element.scrollLeft = e.left, e.element.scrollTop = e.top;
  }
}
var Y0 = hn && "documentMode" in document && 11 >= document.documentMode, Dr = null, eu = null, Ao = null, tu = !1;
function af(e, t, n) {
  var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
  tu || Dr == null || Dr !== ki(r) || (r = Dr, "selectionStart" in r && gc(r) ? r = { start: r.selectionStart, end: r.selectionEnd } : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = { anchorNode: r.anchorNode, anchorOffset: r.anchorOffset, focusNode: r.focusNode, focusOffset: r.focusOffset }), Ao && es(Ao, r) || (Ao = r, r = $i(eu, "onSelect"), 0 < r.length && (t = new hc("onSelect", "select", null, t, n), e.push({ event: t, listeners: r }), t.target = Dr)));
}
function Rs(e, t) {
  var n = {};
  return n[e.toLowerCase()] = t.toLowerCase(), n["Webkit" + e] = "webkit" + t, n["Moz" + e] = "moz" + t, n;
}
var zr = { animationend: Rs("Animation", "AnimationEnd"), animationiteration: Rs("Animation", "AnimationIteration"), animationstart: Rs("Animation", "AnimationStart"), transitionend: Rs("Transition", "TransitionEnd") }, el = {}, lm = {};
hn && (lm = document.createElement("div").style, "AnimationEvent" in window || (delete zr.animationend.animation, delete zr.animationiteration.animation, delete zr.animationstart.animation), "TransitionEvent" in window || delete zr.transitionend.transition);
function ma(e) {
  if (el[e]) return el[e];
  if (!zr[e]) return e;
  var t = zr[e], n;
  for (n in t) if (t.hasOwnProperty(n) && n in lm) return el[e] = t[n];
  return e;
}
var um = ma("animationend"), cm = ma("animationiteration"), dm = ma("animationstart"), fm = ma("transitionend"), pm = /* @__PURE__ */ new Map(), lf = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
function Kn(e, t) {
  pm.set(e, t), br(t, [e]);
}
for (var tl = 0; tl < lf.length; tl++) {
  var nl = lf[tl], G0 = nl.toLowerCase(), X0 = nl[0].toUpperCase() + nl.slice(1);
  Kn(G0, "on" + X0);
}
Kn(um, "onAnimationEnd");
Kn(cm, "onAnimationIteration");
Kn(dm, "onAnimationStart");
Kn("dblclick", "onDoubleClick");
Kn("focusin", "onFocus");
Kn("focusout", "onBlur");
Kn(fm, "onTransitionEnd");
Xr("onMouseEnter", ["mouseout", "mouseover"]);
Xr("onMouseLeave", ["mouseout", "mouseover"]);
Xr("onPointerEnter", ["pointerout", "pointerover"]);
Xr("onPointerLeave", ["pointerout", "pointerover"]);
br("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
br("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
br("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
br("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
br("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
br("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
var $o = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), J0 = new Set("cancel close invalid load scroll toggle".split(" ").concat($o));
function uf(e, t, n) {
  var r = e.type || "unknown-event";
  e.currentTarget = n, Gv(r, t, void 0, e), e.currentTarget = null;
}
function hm(e, t) {
  t = (t & 4) !== 0;
  for (var n = 0; n < e.length; n++) {
    var r = e[n], o = r.event;
    r = r.listeners;
    e: {
      var s = void 0;
      if (t) for (var i = r.length - 1; 0 <= i; i--) {
        var a = r[i], l = a.instance, u = a.currentTarget;
        if (a = a.listener, l !== s && o.isPropagationStopped()) break e;
        uf(o, a, u), s = l;
      }
      else for (i = 0; i < r.length; i++) {
        if (a = r[i], l = a.instance, u = a.currentTarget, a = a.listener, l !== s && o.isPropagationStopped()) break e;
        uf(o, a, u), s = l;
      }
    }
  }
  if (bi) throw e = Gl, bi = !1, Gl = null, e;
}
function he(e, t) {
  var n = t[iu];
  n === void 0 && (n = t[iu] = /* @__PURE__ */ new Set());
  var r = e + "__bubble";
  n.has(r) || (mm(t, e, 2, !1), n.add(r));
}
function rl(e, t, n) {
  var r = 0;
  t && (r |= 4), mm(n, e, r, t);
}
var Ds = "_reactListening" + Math.random().toString(36).slice(2);
function ts(e) {
  if (!e[Ds]) {
    e[Ds] = !0, Sh.forEach(function(n) {
      n !== "selectionchange" && (J0.has(n) || rl(n, !1, e), rl(n, !0, e));
    });
    var t = e.nodeType === 9 ? e : e.ownerDocument;
    t === null || t[Ds] || (t[Ds] = !0, rl("selectionchange", !1, t));
  }
}
function mm(e, t, n, r) {
  switch (Jh(t)) {
    case 1:
      var o = f0;
      break;
    case 4:
      o = p0;
      break;
    default:
      o = fc;
  }
  n = o.bind(null, t, n, e), o = void 0, !Yl || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (o = !0), r ? o !== void 0 ? e.addEventListener(t, n, { capture: !0, passive: o }) : e.addEventListener(t, n, !0) : o !== void 0 ? e.addEventListener(t, n, { passive: o }) : e.addEventListener(t, n, !1);
}
function ol(e, t, n, r, o) {
  var s = r;
  if (!(t & 1) && !(t & 2) && r !== null) e: for (; ; ) {
    if (r === null) return;
    var i = r.tag;
    if (i === 3 || i === 4) {
      var a = r.stateNode.containerInfo;
      if (a === o || a.nodeType === 8 && a.parentNode === o) break;
      if (i === 4) for (i = r.return; i !== null; ) {
        var l = i.tag;
        if ((l === 3 || l === 4) && (l = i.stateNode.containerInfo, l === o || l.nodeType === 8 && l.parentNode === o)) return;
        i = i.return;
      }
      for (; a !== null; ) {
        if (i = ir(a), i === null) return;
        if (l = i.tag, l === 5 || l === 6) {
          r = s = i;
          continue e;
        }
        a = a.parentNode;
      }
    }
    r = r.return;
  }
  Ah(function() {
    var u = s, c = lc(n), p = [];
    e: {
      var g = pm.get(e);
      if (g !== void 0) {
        var w = hc, x = e;
        switch (e) {
          case "keypress":
            if (ti(n) === 0) break e;
          case "keydown":
          case "keyup":
            w = $0;
            break;
          case "focusin":
            x = "focus", w = Xa;
            break;
          case "focusout":
            x = "blur", w = Xa;
            break;
          case "beforeblur":
          case "afterblur":
            w = Xa;
            break;
          case "click":
            if (n.button === 2) break e;
          case "auxclick":
          case "dblclick":
          case "mousedown":
          case "mousemove":
          case "mouseup":
          case "mouseout":
          case "mouseover":
          case "contextmenu":
            w = Gd;
            break;
          case "drag":
          case "dragend":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "dragstart":
          case "drop":
            w = y0;
            break;
          case "touchcancel":
          case "touchend":
          case "touchmove":
          case "touchstart":
            w = N0;
            break;
          case um:
          case cm:
          case dm:
            w = x0;
            break;
          case fm:
            w = P0;
            break;
          case "scroll":
            w = h0;
            break;
          case "wheel":
            w = R0;
            break;
          case "copy":
          case "cut":
          case "paste":
            w = k0;
            break;
          case "gotpointercapture":
          case "lostpointercapture":
          case "pointercancel":
          case "pointerdown":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "pointerup":
            w = Jd;
        }
        var k = (t & 4) !== 0, b = !k && e === "scroll", v = k ? g !== null ? g + "Capture" : null : g;
        k = [];
        for (var f = u, m; f !== null; ) {
          m = f;
          var S = m.stateNode;
          if (m.tag === 5 && S !== null && (m = S, v !== null && (S = Yo(f, v), S != null && k.push(ns(f, S, m)))), b) break;
          f = f.return;
        }
        0 < k.length && (g = new w(g, x, null, n, c), p.push({ event: g, listeners: k }));
      }
    }
    if (!(t & 7)) {
      e: {
        if (g = e === "mouseover" || e === "pointerover", w = e === "mouseout" || e === "pointerout", g && n !== Ql && (x = n.relatedTarget || n.fromElement) && (ir(x) || x[mn])) break e;
        if ((w || g) && (g = c.window === c ? c : (g = c.ownerDocument) ? g.defaultView || g.parentWindow : window, w ? (x = n.relatedTarget || n.toElement, w = u, x = x ? ir(x) : null, x !== null && (b = _r(x), x !== b || x.tag !== 5 && x.tag !== 6) && (x = null)) : (w = null, x = u), w !== x)) {
          if (k = Gd, S = "onMouseLeave", v = "onMouseEnter", f = "mouse", (e === "pointerout" || e === "pointerover") && (k = Jd, S = "onPointerLeave", v = "onPointerEnter", f = "pointer"), b = w == null ? g : Ar(w), m = x == null ? g : Ar(x), g = new k(S, f + "leave", w, n, c), g.target = b, g.relatedTarget = m, S = null, ir(c) === u && (k = new k(v, f + "enter", x, n, c), k.target = m, k.relatedTarget = b, S = k), b = S, w && x) t: {
            for (k = w, v = x, f = 0, m = k; m; m = Tr(m)) f++;
            for (m = 0, S = v; S; S = Tr(S)) m++;
            for (; 0 < f - m; ) k = Tr(k), f--;
            for (; 0 < m - f; ) v = Tr(v), m--;
            for (; f--; ) {
              if (k === v || v !== null && k === v.alternate) break t;
              k = Tr(k), v = Tr(v);
            }
            k = null;
          }
          else k = null;
          w !== null && cf(p, g, w, k, !1), x !== null && b !== null && cf(p, b, x, k, !0);
        }
      }
      e: {
        if (g = u ? Ar(u) : window, w = g.nodeName && g.nodeName.toLowerCase(), w === "select" || w === "input" && g.type === "file") var _ = V0;
        else if (tf(g)) if (om) _ = Z0;
        else {
          _ = W0;
          var T = U0;
        }
        else (w = g.nodeName) && w.toLowerCase() === "input" && (g.type === "checkbox" || g.type === "radio") && (_ = H0);
        if (_ && (_ = _(e, u))) {
          rm(p, _, n, c);
          break e;
        }
        T && T(e, g, u), e === "focusout" && (T = g._wrapperState) && T.controlled && g.type === "number" && Vl(g, "number", g.value);
      }
      switch (T = u ? Ar(u) : window, e) {
        case "focusin":
          (tf(T) || T.contentEditable === "true") && (Dr = T, eu = u, Ao = null);
          break;
        case "focusout":
          Ao = eu = Dr = null;
          break;
        case "mousedown":
          tu = !0;
          break;
        case "contextmenu":
        case "mouseup":
        case "dragend":
          tu = !1, af(p, n, c);
          break;
        case "selectionchange":
          if (Y0) break;
        case "keydown":
        case "keyup":
          af(p, n, c);
      }
      var R;
      if (yc) e: {
        switch (e) {
          case "compositionstart":
            var I = "onCompositionStart";
            break e;
          case "compositionend":
            I = "onCompositionEnd";
            break e;
          case "compositionupdate":
            I = "onCompositionUpdate";
            break e;
        }
        I = void 0;
      }
      else Rr ? tm(e, n) && (I = "onCompositionEnd") : e === "keydown" && n.keyCode === 229 && (I = "onCompositionStart");
      I && (em && n.locale !== "ko" && (Rr || I !== "onCompositionStart" ? I === "onCompositionEnd" && Rr && (R = qh()) : (Pn = c, pc = "value" in Pn ? Pn.value : Pn.textContent, Rr = !0)), T = $i(u, I), 0 < T.length && (I = new Xd(I, e, null, n, c), p.push({ event: I, listeners: T }), R ? I.data = R : (R = nm(n), R !== null && (I.data = R)))), (R = z0 ? A0(e, n) : L0(e, n)) && (u = $i(u, "onBeforeInput"), 0 < u.length && (c = new Xd("onBeforeInput", "beforeinput", null, n, c), p.push({ event: c, listeners: u }), c.data = R));
    }
    hm(p, t);
  });
}
function ns(e, t, n) {
  return { instance: e, listener: t, currentTarget: n };
}
function $i(e, t) {
  for (var n = t + "Capture", r = []; e !== null; ) {
    var o = e, s = o.stateNode;
    o.tag === 5 && s !== null && (o = s, s = Yo(e, n), s != null && r.unshift(ns(e, s, o)), s = Yo(e, t), s != null && r.push(ns(e, s, o))), e = e.return;
  }
  return r;
}
function Tr(e) {
  if (e === null) return null;
  do
    e = e.return;
  while (e && e.tag !== 5);
  return e || null;
}
function cf(e, t, n, r, o) {
  for (var s = t._reactName, i = []; n !== null && n !== r; ) {
    var a = n, l = a.alternate, u = a.stateNode;
    if (l !== null && l === r) break;
    a.tag === 5 && u !== null && (a = u, o ? (l = Yo(n, s), l != null && i.unshift(ns(n, l, a))) : o || (l = Yo(n, s), l != null && i.push(ns(n, l, a)))), n = n.return;
  }
  i.length !== 0 && e.push({ event: t, listeners: i });
}
var q0 = /\r\n?/g, ex = /\u0000|\uFFFD/g;
function df(e) {
  return (typeof e == "string" ? e : "" + e).replace(q0, `
`).replace(ex, "");
}
function zs(e, t, n) {
  if (t = df(t), df(e) !== t && n) throw Error(E(425));
}
function Ii() {
}
var nu = null, ru = null;
function ou(e, t) {
  return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
}
var su = typeof setTimeout == "function" ? setTimeout : void 0, tx = typeof clearTimeout == "function" ? clearTimeout : void 0, ff = typeof Promise == "function" ? Promise : void 0, nx = typeof queueMicrotask == "function" ? queueMicrotask : typeof ff < "u" ? function(e) {
  return ff.resolve(null).then(e).catch(rx);
} : su;
function rx(e) {
  setTimeout(function() {
    throw e;
  });
}
function sl(e, t) {
  var n = t, r = 0;
  do {
    var o = n.nextSibling;
    if (e.removeChild(n), o && o.nodeType === 8) if (n = o.data, n === "/$") {
      if (r === 0) {
        e.removeChild(o), Jo(t);
        return;
      }
      r--;
    } else n !== "$" && n !== "$?" && n !== "$!" || r++;
    n = o;
  } while (n);
  Jo(t);
}
function Fn(e) {
  for (; e != null; e = e.nextSibling) {
    var t = e.nodeType;
    if (t === 1 || t === 3) break;
    if (t === 8) {
      if (t = e.data, t === "$" || t === "$!" || t === "$?") break;
      if (t === "/$") return null;
    }
  }
  return e;
}
function pf(e) {
  e = e.previousSibling;
  for (var t = 0; e; ) {
    if (e.nodeType === 8) {
      var n = e.data;
      if (n === "$" || n === "$!" || n === "$?") {
        if (t === 0) return e;
        t--;
      } else n === "/$" && t++;
    }
    e = e.previousSibling;
  }
  return null;
}
var uo = Math.random().toString(36).slice(2), Jt = "__reactFiber$" + uo, rs = "__reactProps$" + uo, mn = "__reactContainer$" + uo, iu = "__reactEvents$" + uo, ox = "__reactListeners$" + uo, sx = "__reactHandles$" + uo;
function ir(e) {
  var t = e[Jt];
  if (t) return t;
  for (var n = e.parentNode; n; ) {
    if (t = n[mn] || n[Jt]) {
      if (n = t.alternate, t.child !== null || n !== null && n.child !== null) for (e = pf(e); e !== null; ) {
        if (n = e[Jt]) return n;
        e = pf(e);
      }
      return t;
    }
    e = n, n = e.parentNode;
  }
  return null;
}
function xs(e) {
  return e = e[Jt] || e[mn], !e || e.tag !== 5 && e.tag !== 6 && e.tag !== 13 && e.tag !== 3 ? null : e;
}
function Ar(e) {
  if (e.tag === 5 || e.tag === 6) return e.stateNode;
  throw Error(E(33));
}
function ya(e) {
  return e[rs] || null;
}
var au = [], Lr = -1;
function Yn(e) {
  return { current: e };
}
function ye(e) {
  0 > Lr || (e.current = au[Lr], au[Lr] = null, Lr--);
}
function fe(e, t) {
  Lr++, au[Lr] = e.current, e.current = t;
}
var Zn = {}, We = Yn(Zn), at = Yn(!1), hr = Zn;
function Jr(e, t) {
  var n = e.type.contextTypes;
  if (!n) return Zn;
  var r = e.stateNode;
  if (r && r.__reactInternalMemoizedUnmaskedChildContext === t) return r.__reactInternalMemoizedMaskedChildContext;
  var o = {}, s;
  for (s in n) o[s] = t[s];
  return r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = t, e.__reactInternalMemoizedMaskedChildContext = o), o;
}
function lt(e) {
  return e = e.childContextTypes, e != null;
}
function Ti() {
  ye(at), ye(We);
}
function hf(e, t, n) {
  if (We.current !== Zn) throw Error(E(168));
  fe(We, t), fe(at, n);
}
function ym(e, t, n) {
  var r = e.stateNode;
  if (t = t.childContextTypes, typeof r.getChildContext != "function") return n;
  r = r.getChildContext();
  for (var o in r) if (!(o in t)) throw Error(E(108, Uv(e) || "Unknown", o));
  return Se({}, n, r);
}
function Ni(e) {
  return e = (e = e.stateNode) && e.__reactInternalMemoizedMergedChildContext || Zn, hr = We.current, fe(We, e), fe(at, at.current), !0;
}
function mf(e, t, n) {
  var r = e.stateNode;
  if (!r) throw Error(E(169));
  n ? (e = ym(e, t, hr), r.__reactInternalMemoizedMergedChildContext = e, ye(at), ye(We), fe(We, e)) : ye(at), fe(at, n);
}
var ln = null, ga = !1, il = !1;
function gm(e) {
  ln === null ? ln = [e] : ln.push(e);
}
function ix(e) {
  ga = !0, gm(e);
}
function Gn() {
  if (!il && ln !== null) {
    il = !0;
    var e = 0, t = ie;
    try {
      var n = ln;
      for (ie = 1; e < n.length; e++) {
        var r = n[e];
        do
          r = r(!0);
        while (r !== null);
      }
      ln = null, ga = !1;
    } catch (o) {
      throw ln !== null && (ln = ln.slice(e + 1)), Vh(uc, Gn), o;
    } finally {
      ie = t, il = !1;
    }
  }
  return null;
}
var Fr = [], Br = 0, Oi = null, Pi = 0, $t = [], It = 0, mr = null, un = 1, cn = "";
function tr(e, t) {
  Fr[Br++] = Pi, Fr[Br++] = Oi, Oi = e, Pi = t;
}
function vm(e, t, n) {
  $t[It++] = un, $t[It++] = cn, $t[It++] = mr, mr = e;
  var r = un;
  e = cn;
  var o = 32 - Ft(r) - 1;
  r &= ~(1 << o), n += 1;
  var s = 32 - Ft(t) + o;
  if (30 < s) {
    var i = o - o % 5;
    s = (r & (1 << i) - 1).toString(32), r >>= i, o -= i, un = 1 << 32 - Ft(t) + o | n << o | r, cn = s + e;
  } else un = 1 << s | n << o | r, cn = e;
}
function vc(e) {
  e.return !== null && (tr(e, 1), vm(e, 1, 0));
}
function xc(e) {
  for (; e === Oi; ) Oi = Fr[--Br], Fr[Br] = null, Pi = Fr[--Br], Fr[Br] = null;
  for (; e === mr; ) mr = $t[--It], $t[It] = null, cn = $t[--It], $t[It] = null, un = $t[--It], $t[It] = null;
}
var wt = null, xt = null, ge = !1, Lt = null;
function xm(e, t) {
  var n = Tt(5, null, null, 0);
  n.elementType = "DELETED", n.stateNode = t, n.return = e, t = e.deletions, t === null ? (e.deletions = [n], e.flags |= 16) : t.push(n);
}
function yf(e, t) {
  switch (e.tag) {
    case 5:
      var n = e.type;
      return t = t.nodeType !== 1 || n.toLowerCase() !== t.nodeName.toLowerCase() ? null : t, t !== null ? (e.stateNode = t, wt = e, xt = Fn(t.firstChild), !0) : !1;
    case 6:
      return t = e.pendingProps === "" || t.nodeType !== 3 ? null : t, t !== null ? (e.stateNode = t, wt = e, xt = null, !0) : !1;
    case 13:
      return t = t.nodeType !== 8 ? null : t, t !== null ? (n = mr !== null ? { id: un, overflow: cn } : null, e.memoizedState = { dehydrated: t, treeContext: n, retryLane: 1073741824 }, n = Tt(18, null, null, 0), n.stateNode = t, n.return = e, e.child = n, wt = e, xt = null, !0) : !1;
    default:
      return !1;
  }
}
function lu(e) {
  return (e.mode & 1) !== 0 && (e.flags & 128) === 0;
}
function uu(e) {
  if (ge) {
    var t = xt;
    if (t) {
      var n = t;
      if (!yf(e, t)) {
        if (lu(e)) throw Error(E(418));
        t = Fn(n.nextSibling);
        var r = wt;
        t && yf(e, t) ? xm(r, n) : (e.flags = e.flags & -4097 | 2, ge = !1, wt = e);
      }
    } else {
      if (lu(e)) throw Error(E(418));
      e.flags = e.flags & -4097 | 2, ge = !1, wt = e;
    }
  }
}
function gf(e) {
  for (e = e.return; e !== null && e.tag !== 5 && e.tag !== 3 && e.tag !== 13; ) e = e.return;
  wt = e;
}
function As(e) {
  if (e !== wt) return !1;
  if (!ge) return gf(e), ge = !0, !1;
  var t;
  if ((t = e.tag !== 3) && !(t = e.tag !== 5) && (t = e.type, t = t !== "head" && t !== "body" && !ou(e.type, e.memoizedProps)), t && (t = xt)) {
    if (lu(e)) throw wm(), Error(E(418));
    for (; t; ) xm(e, t), t = Fn(t.nextSibling);
  }
  if (gf(e), e.tag === 13) {
    if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(E(317));
    e: {
      for (e = e.nextSibling, t = 0; e; ) {
        if (e.nodeType === 8) {
          var n = e.data;
          if (n === "/$") {
            if (t === 0) {
              xt = Fn(e.nextSibling);
              break e;
            }
            t--;
          } else n !== "$" && n !== "$!" && n !== "$?" || t++;
        }
        e = e.nextSibling;
      }
      xt = null;
    }
  } else xt = wt ? Fn(e.stateNode.nextSibling) : null;
  return !0;
}
function wm() {
  for (var e = xt; e; ) e = Fn(e.nextSibling);
}
function qr() {
  xt = wt = null, ge = !1;
}
function wc(e) {
  Lt === null ? Lt = [e] : Lt.push(e);
}
var ax = kn.ReactCurrentBatchConfig;
function ko(e, t, n) {
  if (e = n.ref, e !== null && typeof e != "function" && typeof e != "object") {
    if (n._owner) {
      if (n = n._owner, n) {
        if (n.tag !== 1) throw Error(E(309));
        var r = n.stateNode;
      }
      if (!r) throw Error(E(147, e));
      var o = r, s = "" + e;
      return t !== null && t.ref !== null && typeof t.ref == "function" && t.ref._stringRef === s ? t.ref : (t = function(i) {
        var a = o.refs;
        i === null ? delete a[s] : a[s] = i;
      }, t._stringRef = s, t);
    }
    if (typeof e != "string") throw Error(E(284));
    if (!n._owner) throw Error(E(290, e));
  }
  return e;
}
function Ls(e, t) {
  throw e = Object.prototype.toString.call(t), Error(E(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e));
}
function vf(e) {
  var t = e._init;
  return t(e._payload);
}
function km(e) {
  function t(v, f) {
    if (e) {
      var m = v.deletions;
      m === null ? (v.deletions = [f], v.flags |= 16) : m.push(f);
    }
  }
  function n(v, f) {
    if (!e) return null;
    for (; f !== null; ) t(v, f), f = f.sibling;
    return null;
  }
  function r(v, f) {
    for (v = /* @__PURE__ */ new Map(); f !== null; ) f.key !== null ? v.set(f.key, f) : v.set(f.index, f), f = f.sibling;
    return v;
  }
  function o(v, f) {
    return v = Wn(v, f), v.index = 0, v.sibling = null, v;
  }
  function s(v, f, m) {
    return v.index = m, e ? (m = v.alternate, m !== null ? (m = m.index, m < f ? (v.flags |= 2, f) : m) : (v.flags |= 2, f)) : (v.flags |= 1048576, f);
  }
  function i(v) {
    return e && v.alternate === null && (v.flags |= 2), v;
  }
  function a(v, f, m, S) {
    return f === null || f.tag !== 6 ? (f = pl(m, v.mode, S), f.return = v, f) : (f = o(f, m), f.return = v, f);
  }
  function l(v, f, m, S) {
    var _ = m.type;
    return _ === Mr ? c(v, f, m.props.children, S, m.key) : f !== null && (f.elementType === _ || typeof _ == "object" && _ !== null && _.$$typeof === jn && vf(_) === f.type) ? (S = o(f, m.props), S.ref = ko(v, f, m), S.return = v, S) : (S = li(m.type, m.key, m.props, null, v.mode, S), S.ref = ko(v, f, m), S.return = v, S);
  }
  function u(v, f, m, S) {
    return f === null || f.tag !== 4 || f.stateNode.containerInfo !== m.containerInfo || f.stateNode.implementation !== m.implementation ? (f = hl(m, v.mode, S), f.return = v, f) : (f = o(f, m.children || []), f.return = v, f);
  }
  function c(v, f, m, S, _) {
    return f === null || f.tag !== 7 ? (f = fr(m, v.mode, S, _), f.return = v, f) : (f = o(f, m), f.return = v, f);
  }
  function p(v, f, m) {
    if (typeof f == "string" && f !== "" || typeof f == "number") return f = pl("" + f, v.mode, m), f.return = v, f;
    if (typeof f == "object" && f !== null) {
      switch (f.$$typeof) {
        case $s:
          return m = li(f.type, f.key, f.props, null, v.mode, m), m.ref = ko(v, null, f), m.return = v, m;
        case Pr:
          return f = hl(f, v.mode, m), f.return = v, f;
        case jn:
          var S = f._init;
          return p(v, S(f._payload), m);
      }
      if (Eo(f) || yo(f)) return f = fr(f, v.mode, m, null), f.return = v, f;
      Ls(v, f);
    }
    return null;
  }
  function g(v, f, m, S) {
    var _ = f !== null ? f.key : null;
    if (typeof m == "string" && m !== "" || typeof m == "number") return _ !== null ? null : a(v, f, "" + m, S);
    if (typeof m == "object" && m !== null) {
      switch (m.$$typeof) {
        case $s:
          return m.key === _ ? l(v, f, m, S) : null;
        case Pr:
          return m.key === _ ? u(v, f, m, S) : null;
        case jn:
          return _ = m._init, g(
            v,
            f,
            _(m._payload),
            S
          );
      }
      if (Eo(m) || yo(m)) return _ !== null ? null : c(v, f, m, S, null);
      Ls(v, m);
    }
    return null;
  }
  function w(v, f, m, S, _) {
    if (typeof S == "string" && S !== "" || typeof S == "number") return v = v.get(m) || null, a(f, v, "" + S, _);
    if (typeof S == "object" && S !== null) {
      switch (S.$$typeof) {
        case $s:
          return v = v.get(S.key === null ? m : S.key) || null, l(f, v, S, _);
        case Pr:
          return v = v.get(S.key === null ? m : S.key) || null, u(f, v, S, _);
        case jn:
          var T = S._init;
          return w(v, f, m, T(S._payload), _);
      }
      if (Eo(S) || yo(S)) return v = v.get(m) || null, c(f, v, S, _, null);
      Ls(f, S);
    }
    return null;
  }
  function x(v, f, m, S) {
    for (var _ = null, T = null, R = f, I = f = 0, Z = null; R !== null && I < m.length; I++) {
      R.index > I ? (Z = R, R = null) : Z = R.sibling;
      var B = g(v, R, m[I], S);
      if (B === null) {
        R === null && (R = Z);
        break;
      }
      e && R && B.alternate === null && t(v, R), f = s(B, f, I), T === null ? _ = B : T.sibling = B, T = B, R = Z;
    }
    if (I === m.length) return n(v, R), ge && tr(v, I), _;
    if (R === null) {
      for (; I < m.length; I++) R = p(v, m[I], S), R !== null && (f = s(R, f, I), T === null ? _ = R : T.sibling = R, T = R);
      return ge && tr(v, I), _;
    }
    for (R = r(v, R); I < m.length; I++) Z = w(R, v, I, m[I], S), Z !== null && (e && Z.alternate !== null && R.delete(Z.key === null ? I : Z.key), f = s(Z, f, I), T === null ? _ = Z : T.sibling = Z, T = Z);
    return e && R.forEach(function(_e) {
      return t(v, _e);
    }), ge && tr(v, I), _;
  }
  function k(v, f, m, S) {
    var _ = yo(m);
    if (typeof _ != "function") throw Error(E(150));
    if (m = _.call(m), m == null) throw Error(E(151));
    for (var T = _ = null, R = f, I = f = 0, Z = null, B = m.next(); R !== null && !B.done; I++, B = m.next()) {
      R.index > I ? (Z = R, R = null) : Z = R.sibling;
      var _e = g(v, R, B.value, S);
      if (_e === null) {
        R === null && (R = Z);
        break;
      }
      e && R && _e.alternate === null && t(v, R), f = s(_e, f, I), T === null ? _ = _e : T.sibling = _e, T = _e, R = Z;
    }
    if (B.done) return n(
      v,
      R
    ), ge && tr(v, I), _;
    if (R === null) {
      for (; !B.done; I++, B = m.next()) B = p(v, B.value, S), B !== null && (f = s(B, f, I), T === null ? _ = B : T.sibling = B, T = B);
      return ge && tr(v, I), _;
    }
    for (R = r(v, R); !B.done; I++, B = m.next()) B = w(R, v, I, B.value, S), B !== null && (e && B.alternate !== null && R.delete(B.key === null ? I : B.key), f = s(B, f, I), T === null ? _ = B : T.sibling = B, T = B);
    return e && R.forEach(function(M) {
      return t(v, M);
    }), ge && tr(v, I), _;
  }
  function b(v, f, m, S) {
    if (typeof m == "object" && m !== null && m.type === Mr && m.key === null && (m = m.props.children), typeof m == "object" && m !== null) {
      switch (m.$$typeof) {
        case $s:
          e: {
            for (var _ = m.key, T = f; T !== null; ) {
              if (T.key === _) {
                if (_ = m.type, _ === Mr) {
                  if (T.tag === 7) {
                    n(v, T.sibling), f = o(T, m.props.children), f.return = v, v = f;
                    break e;
                  }
                } else if (T.elementType === _ || typeof _ == "object" && _ !== null && _.$$typeof === jn && vf(_) === T.type) {
                  n(v, T.sibling), f = o(T, m.props), f.ref = ko(v, T, m), f.return = v, v = f;
                  break e;
                }
                n(v, T);
                break;
              } else t(v, T);
              T = T.sibling;
            }
            m.type === Mr ? (f = fr(m.props.children, v.mode, S, m.key), f.return = v, v = f) : (S = li(m.type, m.key, m.props, null, v.mode, S), S.ref = ko(v, f, m), S.return = v, v = S);
          }
          return i(v);
        case Pr:
          e: {
            for (T = m.key; f !== null; ) {
              if (f.key === T) if (f.tag === 4 && f.stateNode.containerInfo === m.containerInfo && f.stateNode.implementation === m.implementation) {
                n(v, f.sibling), f = o(f, m.children || []), f.return = v, v = f;
                break e;
              } else {
                n(v, f);
                break;
              }
              else t(v, f);
              f = f.sibling;
            }
            f = hl(m, v.mode, S), f.return = v, v = f;
          }
          return i(v);
        case jn:
          return T = m._init, b(v, f, T(m._payload), S);
      }
      if (Eo(m)) return x(v, f, m, S);
      if (yo(m)) return k(v, f, m, S);
      Ls(v, m);
    }
    return typeof m == "string" && m !== "" || typeof m == "number" ? (m = "" + m, f !== null && f.tag === 6 ? (n(v, f.sibling), f = o(f, m), f.return = v, v = f) : (n(v, f), f = pl(m, v.mode, S), f.return = v, v = f), i(v)) : n(v, f);
  }
  return b;
}
var eo = km(!0), Sm = km(!1), Mi = Yn(null), Ri = null, Vr = null, kc = null;
function Sc() {
  kc = Vr = Ri = null;
}
function bc(e) {
  var t = Mi.current;
  ye(Mi), e._currentValue = t;
}
function cu(e, t, n) {
  for (; e !== null; ) {
    var r = e.alternate;
    if ((e.childLanes & t) !== t ? (e.childLanes |= t, r !== null && (r.childLanes |= t)) : r !== null && (r.childLanes & t) !== t && (r.childLanes |= t), e === n) break;
    e = e.return;
  }
}
function Yr(e, t) {
  Ri = e, kc = Vr = null, e = e.dependencies, e !== null && e.firstContext !== null && (e.lanes & t && (st = !0), e.firstContext = null);
}
function Ot(e) {
  var t = e._currentValue;
  if (kc !== e) if (e = { context: e, memoizedValue: t, next: null }, Vr === null) {
    if (Ri === null) throw Error(E(308));
    Vr = e, Ri.dependencies = { lanes: 0, firstContext: e };
  } else Vr = Vr.next = e;
  return t;
}
var ar = null;
function _c(e) {
  ar === null ? ar = [e] : ar.push(e);
}
function bm(e, t, n, r) {
  var o = t.interleaved;
  return o === null ? (n.next = n, _c(t)) : (n.next = o.next, o.next = n), t.interleaved = n, yn(e, r);
}
function yn(e, t) {
  e.lanes |= t;
  var n = e.alternate;
  for (n !== null && (n.lanes |= t), n = e, e = e.return; e !== null; ) e.childLanes |= t, n = e.alternate, n !== null && (n.childLanes |= t), n = e, e = e.return;
  return n.tag === 3 ? n.stateNode : null;
}
var $n = !1;
function Cc(e) {
  e.updateQueue = { baseState: e.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
}
function _m(e, t) {
  e = e.updateQueue, t.updateQueue === e && (t.updateQueue = { baseState: e.baseState, firstBaseUpdate: e.firstBaseUpdate, lastBaseUpdate: e.lastBaseUpdate, shared: e.shared, effects: e.effects });
}
function fn(e, t) {
  return { eventTime: e, lane: t, tag: 0, payload: null, callback: null, next: null };
}
function Bn(e, t, n) {
  var r = e.updateQueue;
  if (r === null) return null;
  if (r = r.shared, se & 2) {
    var o = r.pending;
    return o === null ? t.next = t : (t.next = o.next, o.next = t), r.pending = t, yn(e, n);
  }
  return o = r.interleaved, o === null ? (t.next = t, _c(r)) : (t.next = o.next, o.next = t), r.interleaved = t, yn(e, n);
}
function ni(e, t, n) {
  if (t = t.updateQueue, t !== null && (t = t.shared, (n & 4194240) !== 0)) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, cc(e, n);
  }
}
function xf(e, t) {
  var n = e.updateQueue, r = e.alternate;
  if (r !== null && (r = r.updateQueue, n === r)) {
    var o = null, s = null;
    if (n = n.firstBaseUpdate, n !== null) {
      do {
        var i = { eventTime: n.eventTime, lane: n.lane, tag: n.tag, payload: n.payload, callback: n.callback, next: null };
        s === null ? o = s = i : s = s.next = i, n = n.next;
      } while (n !== null);
      s === null ? o = s = t : s = s.next = t;
    } else o = s = t;
    n = { baseState: r.baseState, firstBaseUpdate: o, lastBaseUpdate: s, shared: r.shared, effects: r.effects }, e.updateQueue = n;
    return;
  }
  e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
}
function Di(e, t, n, r) {
  var o = e.updateQueue;
  $n = !1;
  var s = o.firstBaseUpdate, i = o.lastBaseUpdate, a = o.shared.pending;
  if (a !== null) {
    o.shared.pending = null;
    var l = a, u = l.next;
    l.next = null, i === null ? s = u : i.next = u, i = l;
    var c = e.alternate;
    c !== null && (c = c.updateQueue, a = c.lastBaseUpdate, a !== i && (a === null ? c.firstBaseUpdate = u : a.next = u, c.lastBaseUpdate = l));
  }
  if (s !== null) {
    var p = o.baseState;
    i = 0, c = u = l = null, a = s;
    do {
      var g = a.lane, w = a.eventTime;
      if ((r & g) === g) {
        c !== null && (c = c.next = {
          eventTime: w,
          lane: 0,
          tag: a.tag,
          payload: a.payload,
          callback: a.callback,
          next: null
        });
        e: {
          var x = e, k = a;
          switch (g = t, w = n, k.tag) {
            case 1:
              if (x = k.payload, typeof x == "function") {
                p = x.call(w, p, g);
                break e;
              }
              p = x;
              break e;
            case 3:
              x.flags = x.flags & -65537 | 128;
            case 0:
              if (x = k.payload, g = typeof x == "function" ? x.call(w, p, g) : x, g == null) break e;
              p = Se({}, p, g);
              break e;
            case 2:
              $n = !0;
          }
        }
        a.callback !== null && a.lane !== 0 && (e.flags |= 64, g = o.effects, g === null ? o.effects = [a] : g.push(a));
      } else w = { eventTime: w, lane: g, tag: a.tag, payload: a.payload, callback: a.callback, next: null }, c === null ? (u = c = w, l = p) : c = c.next = w, i |= g;
      if (a = a.next, a === null) {
        if (a = o.shared.pending, a === null) break;
        g = a, a = g.next, g.next = null, o.lastBaseUpdate = g, o.shared.pending = null;
      }
    } while (!0);
    if (c === null && (l = p), o.baseState = l, o.firstBaseUpdate = u, o.lastBaseUpdate = c, t = o.shared.interleaved, t !== null) {
      o = t;
      do
        i |= o.lane, o = o.next;
      while (o !== t);
    } else s === null && (o.shared.lanes = 0);
    gr |= i, e.lanes = i, e.memoizedState = p;
  }
}
function wf(e, t, n) {
  if (e = t.effects, t.effects = null, e !== null) for (t = 0; t < e.length; t++) {
    var r = e[t], o = r.callback;
    if (o !== null) {
      if (r.callback = null, r = n, typeof o != "function") throw Error(E(191, o));
      o.call(r);
    }
  }
}
var ws = {}, tn = Yn(ws), os = Yn(ws), ss = Yn(ws);
function lr(e) {
  if (e === ws) throw Error(E(174));
  return e;
}
function Ec(e, t) {
  switch (fe(ss, t), fe(os, e), fe(tn, ws), e = t.nodeType, e) {
    case 9:
    case 11:
      t = (t = t.documentElement) ? t.namespaceURI : Wl(null, "");
      break;
    default:
      e = e === 8 ? t.parentNode : t, t = e.namespaceURI || null, e = e.tagName, t = Wl(t, e);
  }
  ye(tn), fe(tn, t);
}
function to() {
  ye(tn), ye(os), ye(ss);
}
function Cm(e) {
  lr(ss.current);
  var t = lr(tn.current), n = Wl(t, e.type);
  t !== n && (fe(os, e), fe(tn, n));
}
function jc(e) {
  os.current === e && (ye(tn), ye(os));
}
var we = Yn(0);
function zi(e) {
  for (var t = e; t !== null; ) {
    if (t.tag === 13) {
      var n = t.memoizedState;
      if (n !== null && (n = n.dehydrated, n === null || n.data === "$?" || n.data === "$!")) return t;
    } else if (t.tag === 19 && t.memoizedProps.revealOrder !== void 0) {
      if (t.flags & 128) return t;
    } else if (t.child !== null) {
      t.child.return = t, t = t.child;
      continue;
    }
    if (t === e) break;
    for (; t.sibling === null; ) {
      if (t.return === null || t.return === e) return null;
      t = t.return;
    }
    t.sibling.return = t.return, t = t.sibling;
  }
  return null;
}
var al = [];
function $c() {
  for (var e = 0; e < al.length; e++) al[e]._workInProgressVersionPrimary = null;
  al.length = 0;
}
var ri = kn.ReactCurrentDispatcher, ll = kn.ReactCurrentBatchConfig, yr = 0, ke = null, Ie = null, Ne = null, Ai = !1, Lo = !1, is = 0, lx = 0;
function Fe() {
  throw Error(E(321));
}
function Ic(e, t) {
  if (t === null) return !1;
  for (var n = 0; n < t.length && n < e.length; n++) if (!Ut(e[n], t[n])) return !1;
  return !0;
}
function Tc(e, t, n, r, o, s) {
  if (yr = s, ke = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, ri.current = e === null || e.memoizedState === null ? fx : px, e = n(r, o), Lo) {
    s = 0;
    do {
      if (Lo = !1, is = 0, 25 <= s) throw Error(E(301));
      s += 1, Ne = Ie = null, t.updateQueue = null, ri.current = hx, e = n(r, o);
    } while (Lo);
  }
  if (ri.current = Li, t = Ie !== null && Ie.next !== null, yr = 0, Ne = Ie = ke = null, Ai = !1, t) throw Error(E(300));
  return e;
}
function Nc() {
  var e = is !== 0;
  return is = 0, e;
}
function Xt() {
  var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
  return Ne === null ? ke.memoizedState = Ne = e : Ne = Ne.next = e, Ne;
}
function Pt() {
  if (Ie === null) {
    var e = ke.alternate;
    e = e !== null ? e.memoizedState : null;
  } else e = Ie.next;
  var t = Ne === null ? ke.memoizedState : Ne.next;
  if (t !== null) Ne = t, Ie = e;
  else {
    if (e === null) throw Error(E(310));
    Ie = e, e = { memoizedState: Ie.memoizedState, baseState: Ie.baseState, baseQueue: Ie.baseQueue, queue: Ie.queue, next: null }, Ne === null ? ke.memoizedState = Ne = e : Ne = Ne.next = e;
  }
  return Ne;
}
function as(e, t) {
  return typeof t == "function" ? t(e) : t;
}
function ul(e) {
  var t = Pt(), n = t.queue;
  if (n === null) throw Error(E(311));
  n.lastRenderedReducer = e;
  var r = Ie, o = r.baseQueue, s = n.pending;
  if (s !== null) {
    if (o !== null) {
      var i = o.next;
      o.next = s.next, s.next = i;
    }
    r.baseQueue = o = s, n.pending = null;
  }
  if (o !== null) {
    s = o.next, r = r.baseState;
    var a = i = null, l = null, u = s;
    do {
      var c = u.lane;
      if ((yr & c) === c) l !== null && (l = l.next = { lane: 0, action: u.action, hasEagerState: u.hasEagerState, eagerState: u.eagerState, next: null }), r = u.hasEagerState ? u.eagerState : e(r, u.action);
      else {
        var p = {
          lane: c,
          action: u.action,
          hasEagerState: u.hasEagerState,
          eagerState: u.eagerState,
          next: null
        };
        l === null ? (a = l = p, i = r) : l = l.next = p, ke.lanes |= c, gr |= c;
      }
      u = u.next;
    } while (u !== null && u !== s);
    l === null ? i = r : l.next = a, Ut(r, t.memoizedState) || (st = !0), t.memoizedState = r, t.baseState = i, t.baseQueue = l, n.lastRenderedState = r;
  }
  if (e = n.interleaved, e !== null) {
    o = e;
    do
      s = o.lane, ke.lanes |= s, gr |= s, o = o.next;
    while (o !== e);
  } else o === null && (n.lanes = 0);
  return [t.memoizedState, n.dispatch];
}
function cl(e) {
  var t = Pt(), n = t.queue;
  if (n === null) throw Error(E(311));
  n.lastRenderedReducer = e;
  var r = n.dispatch, o = n.pending, s = t.memoizedState;
  if (o !== null) {
    n.pending = null;
    var i = o = o.next;
    do
      s = e(s, i.action), i = i.next;
    while (i !== o);
    Ut(s, t.memoizedState) || (st = !0), t.memoizedState = s, t.baseQueue === null && (t.baseState = s), n.lastRenderedState = s;
  }
  return [s, r];
}
function Em() {
}
function jm(e, t) {
  var n = ke, r = Pt(), o = t(), s = !Ut(r.memoizedState, o);
  if (s && (r.memoizedState = o, st = !0), r = r.queue, Oc(Tm.bind(null, n, r, e), [e]), r.getSnapshot !== t || s || Ne !== null && Ne.memoizedState.tag & 1) {
    if (n.flags |= 2048, ls(9, Im.bind(null, n, r, o, t), void 0, null), Oe === null) throw Error(E(349));
    yr & 30 || $m(n, t, o);
  }
  return o;
}
function $m(e, t, n) {
  e.flags |= 16384, e = { getSnapshot: t, value: n }, t = ke.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, ke.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
}
function Im(e, t, n, r) {
  t.value = n, t.getSnapshot = r, Nm(t) && Om(e);
}
function Tm(e, t, n) {
  return n(function() {
    Nm(t) && Om(e);
  });
}
function Nm(e) {
  var t = e.getSnapshot;
  e = e.value;
  try {
    var n = t();
    return !Ut(e, n);
  } catch {
    return !0;
  }
}
function Om(e) {
  var t = yn(e, 1);
  t !== null && Bt(t, e, 1, -1);
}
function kf(e) {
  var t = Xt();
  return typeof e == "function" && (e = e()), t.memoizedState = t.baseState = e, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: as, lastRenderedState: e }, t.queue = e, e = e.dispatch = dx.bind(null, ke, e), [t.memoizedState, e];
}
function ls(e, t, n, r) {
  return e = { tag: e, create: t, destroy: n, deps: r, next: null }, t = ke.updateQueue, t === null ? (t = { lastEffect: null, stores: null }, ke.updateQueue = t, t.lastEffect = e.next = e) : (n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e)), e;
}
function Pm() {
  return Pt().memoizedState;
}
function oi(e, t, n, r) {
  var o = Xt();
  ke.flags |= e, o.memoizedState = ls(1 | t, n, void 0, r === void 0 ? null : r);
}
function va(e, t, n, r) {
  var o = Pt();
  r = r === void 0 ? null : r;
  var s = void 0;
  if (Ie !== null) {
    var i = Ie.memoizedState;
    if (s = i.destroy, r !== null && Ic(r, i.deps)) {
      o.memoizedState = ls(t, n, s, r);
      return;
    }
  }
  ke.flags |= e, o.memoizedState = ls(1 | t, n, s, r);
}
function Sf(e, t) {
  return oi(8390656, 8, e, t);
}
function Oc(e, t) {
  return va(2048, 8, e, t);
}
function Mm(e, t) {
  return va(4, 2, e, t);
}
function Rm(e, t) {
  return va(4, 4, e, t);
}
function Dm(e, t) {
  if (typeof t == "function") return e = e(), t(e), function() {
    t(null);
  };
  if (t != null) return e = e(), t.current = e, function() {
    t.current = null;
  };
}
function zm(e, t, n) {
  return n = n != null ? n.concat([e]) : null, va(4, 4, Dm.bind(null, t, e), n);
}
function Pc() {
}
function Am(e, t) {
  var n = Pt();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && Ic(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
}
function Lm(e, t) {
  var n = Pt();
  t = t === void 0 ? null : t;
  var r = n.memoizedState;
  return r !== null && t !== null && Ic(t, r[1]) ? r[0] : (e = e(), n.memoizedState = [e, t], e);
}
function Fm(e, t, n) {
  return yr & 21 ? (Ut(n, t) || (n = Hh(), ke.lanes |= n, gr |= n, e.baseState = !0), t) : (e.baseState && (e.baseState = !1, st = !0), e.memoizedState = n);
}
function ux(e, t) {
  var n = ie;
  ie = n !== 0 && 4 > n ? n : 4, e(!0);
  var r = ll.transition;
  ll.transition = {};
  try {
    e(!1), t();
  } finally {
    ie = n, ll.transition = r;
  }
}
function Bm() {
  return Pt().memoizedState;
}
function cx(e, t, n) {
  var r = Un(e);
  if (n = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null }, Vm(e)) Um(t, n);
  else if (n = bm(e, t, n, r), n !== null) {
    var o = Ye();
    Bt(n, e, r, o), Wm(n, t, r);
  }
}
function dx(e, t, n) {
  var r = Un(e), o = { lane: r, action: n, hasEagerState: !1, eagerState: null, next: null };
  if (Vm(e)) Um(t, o);
  else {
    var s = e.alternate;
    if (e.lanes === 0 && (s === null || s.lanes === 0) && (s = t.lastRenderedReducer, s !== null)) try {
      var i = t.lastRenderedState, a = s(i, n);
      if (o.hasEagerState = !0, o.eagerState = a, Ut(a, i)) {
        var l = t.interleaved;
        l === null ? (o.next = o, _c(t)) : (o.next = l.next, l.next = o), t.interleaved = o;
        return;
      }
    } catch {
    } finally {
    }
    n = bm(e, t, o, r), n !== null && (o = Ye(), Bt(n, e, r, o), Wm(n, t, r));
  }
}
function Vm(e) {
  var t = e.alternate;
  return e === ke || t !== null && t === ke;
}
function Um(e, t) {
  Lo = Ai = !0;
  var n = e.pending;
  n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
}
function Wm(e, t, n) {
  if (n & 4194240) {
    var r = t.lanes;
    r &= e.pendingLanes, n |= r, t.lanes = n, cc(e, n);
  }
}
var Li = { readContext: Ot, useCallback: Fe, useContext: Fe, useEffect: Fe, useImperativeHandle: Fe, useInsertionEffect: Fe, useLayoutEffect: Fe, useMemo: Fe, useReducer: Fe, useRef: Fe, useState: Fe, useDebugValue: Fe, useDeferredValue: Fe, useTransition: Fe, useMutableSource: Fe, useSyncExternalStore: Fe, useId: Fe, unstable_isNewReconciler: !1 }, fx = { readContext: Ot, useCallback: function(e, t) {
  return Xt().memoizedState = [e, t === void 0 ? null : t], e;
}, useContext: Ot, useEffect: Sf, useImperativeHandle: function(e, t, n) {
  return n = n != null ? n.concat([e]) : null, oi(
    4194308,
    4,
    Dm.bind(null, t, e),
    n
  );
}, useLayoutEffect: function(e, t) {
  return oi(4194308, 4, e, t);
}, useInsertionEffect: function(e, t) {
  return oi(4, 2, e, t);
}, useMemo: function(e, t) {
  var n = Xt();
  return t = t === void 0 ? null : t, e = e(), n.memoizedState = [e, t], e;
}, useReducer: function(e, t, n) {
  var r = Xt();
  return t = n !== void 0 ? n(t) : t, r.memoizedState = r.baseState = t, e = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: e, lastRenderedState: t }, r.queue = e, e = e.dispatch = cx.bind(null, ke, e), [r.memoizedState, e];
}, useRef: function(e) {
  var t = Xt();
  return e = { current: e }, t.memoizedState = e;
}, useState: kf, useDebugValue: Pc, useDeferredValue: function(e) {
  return Xt().memoizedState = e;
}, useTransition: function() {
  var e = kf(!1), t = e[0];
  return e = ux.bind(null, e[1]), Xt().memoizedState = e, [t, e];
}, useMutableSource: function() {
}, useSyncExternalStore: function(e, t, n) {
  var r = ke, o = Xt();
  if (ge) {
    if (n === void 0) throw Error(E(407));
    n = n();
  } else {
    if (n = t(), Oe === null) throw Error(E(349));
    yr & 30 || $m(r, t, n);
  }
  o.memoizedState = n;
  var s = { value: n, getSnapshot: t };
  return o.queue = s, Sf(Tm.bind(
    null,
    r,
    s,
    e
  ), [e]), r.flags |= 2048, ls(9, Im.bind(null, r, s, n, t), void 0, null), n;
}, useId: function() {
  var e = Xt(), t = Oe.identifierPrefix;
  if (ge) {
    var n = cn, r = un;
    n = (r & ~(1 << 32 - Ft(r) - 1)).toString(32) + n, t = ":" + t + "R" + n, n = is++, 0 < n && (t += "H" + n.toString(32)), t += ":";
  } else n = lx++, t = ":" + t + "r" + n.toString(32) + ":";
  return e.memoizedState = t;
}, unstable_isNewReconciler: !1 }, px = {
  readContext: Ot,
  useCallback: Am,
  useContext: Ot,
  useEffect: Oc,
  useImperativeHandle: zm,
  useInsertionEffect: Mm,
  useLayoutEffect: Rm,
  useMemo: Lm,
  useReducer: ul,
  useRef: Pm,
  useState: function() {
    return ul(as);
  },
  useDebugValue: Pc,
  useDeferredValue: function(e) {
    var t = Pt();
    return Fm(t, Ie.memoizedState, e);
  },
  useTransition: function() {
    var e = ul(as)[0], t = Pt().memoizedState;
    return [e, t];
  },
  useMutableSource: Em,
  useSyncExternalStore: jm,
  useId: Bm,
  unstable_isNewReconciler: !1
}, hx = { readContext: Ot, useCallback: Am, useContext: Ot, useEffect: Oc, useImperativeHandle: zm, useInsertionEffect: Mm, useLayoutEffect: Rm, useMemo: Lm, useReducer: cl, useRef: Pm, useState: function() {
  return cl(as);
}, useDebugValue: Pc, useDeferredValue: function(e) {
  var t = Pt();
  return Ie === null ? t.memoizedState = e : Fm(t, Ie.memoizedState, e);
}, useTransition: function() {
  var e = cl(as)[0], t = Pt().memoizedState;
  return [e, t];
}, useMutableSource: Em, useSyncExternalStore: jm, useId: Bm, unstable_isNewReconciler: !1 };
function zt(e, t) {
  if (e && e.defaultProps) {
    t = Se({}, t), e = e.defaultProps;
    for (var n in e) t[n] === void 0 && (t[n] = e[n]);
    return t;
  }
  return t;
}
function du(e, t, n, r) {
  t = e.memoizedState, n = n(r, t), n = n == null ? t : Se({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
}
var xa = { isMounted: function(e) {
  return (e = e._reactInternals) ? _r(e) === e : !1;
}, enqueueSetState: function(e, t, n) {
  e = e._reactInternals;
  var r = Ye(), o = Un(e), s = fn(r, o);
  s.payload = t, n != null && (s.callback = n), t = Bn(e, s, o), t !== null && (Bt(t, e, o, r), ni(t, e, o));
}, enqueueReplaceState: function(e, t, n) {
  e = e._reactInternals;
  var r = Ye(), o = Un(e), s = fn(r, o);
  s.tag = 1, s.payload = t, n != null && (s.callback = n), t = Bn(e, s, o), t !== null && (Bt(t, e, o, r), ni(t, e, o));
}, enqueueForceUpdate: function(e, t) {
  e = e._reactInternals;
  var n = Ye(), r = Un(e), o = fn(n, r);
  o.tag = 2, t != null && (o.callback = t), t = Bn(e, o, r), t !== null && (Bt(t, e, r, n), ni(t, e, r));
} };
function bf(e, t, n, r, o, s, i) {
  return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, s, i) : t.prototype && t.prototype.isPureReactComponent ? !es(n, r) || !es(o, s) : !0;
}
function Hm(e, t, n) {
  var r = !1, o = Zn, s = t.contextType;
  return typeof s == "object" && s !== null ? s = Ot(s) : (o = lt(t) ? hr : We.current, r = t.contextTypes, s = (r = r != null) ? Jr(e, o) : Zn), t = new t(n, s), e.memoizedState = t.state !== null && t.state !== void 0 ? t.state : null, t.updater = xa, e.stateNode = t, t._reactInternals = e, r && (e = e.stateNode, e.__reactInternalMemoizedUnmaskedChildContext = o, e.__reactInternalMemoizedMaskedChildContext = s), t;
}
function _f(e, t, n, r) {
  e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && xa.enqueueReplaceState(t, t.state, null);
}
function fu(e, t, n, r) {
  var o = e.stateNode;
  o.props = n, o.state = e.memoizedState, o.refs = {}, Cc(e);
  var s = t.contextType;
  typeof s == "object" && s !== null ? o.context = Ot(s) : (s = lt(t) ? hr : We.current, o.context = Jr(e, s)), o.state = e.memoizedState, s = t.getDerivedStateFromProps, typeof s == "function" && (du(e, t, s, n), o.state = e.memoizedState), typeof t.getDerivedStateFromProps == "function" || typeof o.getSnapshotBeforeUpdate == "function" || typeof o.UNSAFE_componentWillMount != "function" && typeof o.componentWillMount != "function" || (t = o.state, typeof o.componentWillMount == "function" && o.componentWillMount(), typeof o.UNSAFE_componentWillMount == "function" && o.UNSAFE_componentWillMount(), t !== o.state && xa.enqueueReplaceState(o, o.state, null), Di(e, n, o, r), o.state = e.memoizedState), typeof o.componentDidMount == "function" && (e.flags |= 4194308);
}
function no(e, t) {
  try {
    var n = "", r = t;
    do
      n += Vv(r), r = r.return;
    while (r);
    var o = n;
  } catch (s) {
    o = `
Error generating stack: ` + s.message + `
` + s.stack;
  }
  return { value: e, source: t, stack: o, digest: null };
}
function dl(e, t, n) {
  return { value: e, source: null, stack: n ?? null, digest: t ?? null };
}
function pu(e, t) {
  try {
    console.error(t.value);
  } catch (n) {
    setTimeout(function() {
      throw n;
    });
  }
}
var mx = typeof WeakMap == "function" ? WeakMap : Map;
function Zm(e, t, n) {
  n = fn(-1, n), n.tag = 3, n.payload = { element: null };
  var r = t.value;
  return n.callback = function() {
    Bi || (Bi = !0, bu = r), pu(e, t);
  }, n;
}
function Qm(e, t, n) {
  n = fn(-1, n), n.tag = 3;
  var r = e.type.getDerivedStateFromError;
  if (typeof r == "function") {
    var o = t.value;
    n.payload = function() {
      return r(o);
    }, n.callback = function() {
      pu(e, t);
    };
  }
  var s = e.stateNode;
  return s !== null && typeof s.componentDidCatch == "function" && (n.callback = function() {
    pu(e, t), typeof r != "function" && (Vn === null ? Vn = /* @__PURE__ */ new Set([this]) : Vn.add(this));
    var i = t.stack;
    this.componentDidCatch(t.value, { componentStack: i !== null ? i : "" });
  }), n;
}
function Cf(e, t, n) {
  var r = e.pingCache;
  if (r === null) {
    r = e.pingCache = new mx();
    var o = /* @__PURE__ */ new Set();
    r.set(t, o);
  } else o = r.get(t), o === void 0 && (o = /* @__PURE__ */ new Set(), r.set(t, o));
  o.has(n) || (o.add(n), e = Ix.bind(null, e, t, n), t.then(e, e));
}
function Ef(e) {
  do {
    var t;
    if ((t = e.tag === 13) && (t = e.memoizedState, t = t !== null ? t.dehydrated !== null : !0), t) return e;
    e = e.return;
  } while (e !== null);
  return null;
}
function jf(e, t, n, r, o) {
  return e.mode & 1 ? (e.flags |= 65536, e.lanes = o, e) : (e === t ? e.flags |= 65536 : (e.flags |= 128, n.flags |= 131072, n.flags &= -52805, n.tag === 1 && (n.alternate === null ? n.tag = 17 : (t = fn(-1, 1), t.tag = 2, Bn(n, t, 1))), n.lanes |= 1), e);
}
var yx = kn.ReactCurrentOwner, st = !1;
function Ze(e, t, n, r) {
  t.child = e === null ? Sm(t, null, n, r) : eo(t, e.child, n, r);
}
function $f(e, t, n, r, o) {
  n = n.render;
  var s = t.ref;
  return Yr(t, o), r = Tc(e, t, n, r, s, o), n = Nc(), e !== null && !st ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~o, gn(e, t, o)) : (ge && n && vc(t), t.flags |= 1, Ze(e, t, r, o), t.child);
}
function If(e, t, n, r, o) {
  if (e === null) {
    var s = n.type;
    return typeof s == "function" && !Bc(s) && s.defaultProps === void 0 && n.compare === null && n.defaultProps === void 0 ? (t.tag = 15, t.type = s, Km(e, t, s, r, o)) : (e = li(n.type, null, r, t, t.mode, o), e.ref = t.ref, e.return = t, t.child = e);
  }
  if (s = e.child, !(e.lanes & o)) {
    var i = s.memoizedProps;
    if (n = n.compare, n = n !== null ? n : es, n(i, r) && e.ref === t.ref) return gn(e, t, o);
  }
  return t.flags |= 1, e = Wn(s, r), e.ref = t.ref, e.return = t, t.child = e;
}
function Km(e, t, n, r, o) {
  if (e !== null) {
    var s = e.memoizedProps;
    if (es(s, r) && e.ref === t.ref) if (st = !1, t.pendingProps = r = s, (e.lanes & o) !== 0) e.flags & 131072 && (st = !0);
    else return t.lanes = e.lanes, gn(e, t, o);
  }
  return hu(e, t, n, r, o);
}
function Ym(e, t, n) {
  var r = t.pendingProps, o = r.children, s = e !== null ? e.memoizedState : null;
  if (r.mode === "hidden") if (!(t.mode & 1)) t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, fe(Wr, pt), pt |= n;
  else {
    if (!(n & 1073741824)) return e = s !== null ? s.baseLanes | n : n, t.lanes = t.childLanes = 1073741824, t.memoizedState = { baseLanes: e, cachePool: null, transitions: null }, t.updateQueue = null, fe(Wr, pt), pt |= e, null;
    t.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, r = s !== null ? s.baseLanes : n, fe(Wr, pt), pt |= r;
  }
  else s !== null ? (r = s.baseLanes | n, t.memoizedState = null) : r = n, fe(Wr, pt), pt |= r;
  return Ze(e, t, o, n), t.child;
}
function Gm(e, t) {
  var n = t.ref;
  (e === null && n !== null || e !== null && e.ref !== n) && (t.flags |= 512, t.flags |= 2097152);
}
function hu(e, t, n, r, o) {
  var s = lt(n) ? hr : We.current;
  return s = Jr(t, s), Yr(t, o), n = Tc(e, t, n, r, s, o), r = Nc(), e !== null && !st ? (t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~o, gn(e, t, o)) : (ge && r && vc(t), t.flags |= 1, Ze(e, t, n, o), t.child);
}
function Tf(e, t, n, r, o) {
  if (lt(n)) {
    var s = !0;
    Ni(t);
  } else s = !1;
  if (Yr(t, o), t.stateNode === null) si(e, t), Hm(t, n, r), fu(t, n, r, o), r = !0;
  else if (e === null) {
    var i = t.stateNode, a = t.memoizedProps;
    i.props = a;
    var l = i.context, u = n.contextType;
    typeof u == "object" && u !== null ? u = Ot(u) : (u = lt(n) ? hr : We.current, u = Jr(t, u));
    var c = n.getDerivedStateFromProps, p = typeof c == "function" || typeof i.getSnapshotBeforeUpdate == "function";
    p || typeof i.UNSAFE_componentWillReceiveProps != "function" && typeof i.componentWillReceiveProps != "function" || (a !== r || l !== u) && _f(t, i, r, u), $n = !1;
    var g = t.memoizedState;
    i.state = g, Di(t, r, i, o), l = t.memoizedState, a !== r || g !== l || at.current || $n ? (typeof c == "function" && (du(t, n, c, r), l = t.memoizedState), (a = $n || bf(t, n, a, r, g, l, u)) ? (p || typeof i.UNSAFE_componentWillMount != "function" && typeof i.componentWillMount != "function" || (typeof i.componentWillMount == "function" && i.componentWillMount(), typeof i.UNSAFE_componentWillMount == "function" && i.UNSAFE_componentWillMount()), typeof i.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof i.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = l), i.props = r, i.state = l, i.context = u, r = a) : (typeof i.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
  } else {
    i = t.stateNode, _m(e, t), a = t.memoizedProps, u = t.type === t.elementType ? a : zt(t.type, a), i.props = u, p = t.pendingProps, g = i.context, l = n.contextType, typeof l == "object" && l !== null ? l = Ot(l) : (l = lt(n) ? hr : We.current, l = Jr(t, l));
    var w = n.getDerivedStateFromProps;
    (c = typeof w == "function" || typeof i.getSnapshotBeforeUpdate == "function") || typeof i.UNSAFE_componentWillReceiveProps != "function" && typeof i.componentWillReceiveProps != "function" || (a !== p || g !== l) && _f(t, i, r, l), $n = !1, g = t.memoizedState, i.state = g, Di(t, r, i, o);
    var x = t.memoizedState;
    a !== p || g !== x || at.current || $n ? (typeof w == "function" && (du(t, n, w, r), x = t.memoizedState), (u = $n || bf(t, n, u, r, g, x, l) || !1) ? (c || typeof i.UNSAFE_componentWillUpdate != "function" && typeof i.componentWillUpdate != "function" || (typeof i.componentWillUpdate == "function" && i.componentWillUpdate(r, x, l), typeof i.UNSAFE_componentWillUpdate == "function" && i.UNSAFE_componentWillUpdate(r, x, l)), typeof i.componentDidUpdate == "function" && (t.flags |= 4), typeof i.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof i.componentDidUpdate != "function" || a === e.memoizedProps && g === e.memoizedState || (t.flags |= 4), typeof i.getSnapshotBeforeUpdate != "function" || a === e.memoizedProps && g === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = x), i.props = r, i.state = x, i.context = l, r = u) : (typeof i.componentDidUpdate != "function" || a === e.memoizedProps && g === e.memoizedState || (t.flags |= 4), typeof i.getSnapshotBeforeUpdate != "function" || a === e.memoizedProps && g === e.memoizedState || (t.flags |= 1024), r = !1);
  }
  return mu(e, t, n, r, s, o);
}
function mu(e, t, n, r, o, s) {
  Gm(e, t);
  var i = (t.flags & 128) !== 0;
  if (!r && !i) return o && mf(t, n, !1), gn(e, t, s);
  r = t.stateNode, yx.current = t;
  var a = i && typeof n.getDerivedStateFromError != "function" ? null : r.render();
  return t.flags |= 1, e !== null && i ? (t.child = eo(t, e.child, null, s), t.child = eo(t, null, a, s)) : Ze(e, t, a, s), t.memoizedState = r.state, o && mf(t, n, !0), t.child;
}
function Xm(e) {
  var t = e.stateNode;
  t.pendingContext ? hf(e, t.pendingContext, t.pendingContext !== t.context) : t.context && hf(e, t.context, !1), Ec(e, t.containerInfo);
}
function Nf(e, t, n, r, o) {
  return qr(), wc(o), t.flags |= 256, Ze(e, t, n, r), t.child;
}
var yu = { dehydrated: null, treeContext: null, retryLane: 0 };
function gu(e) {
  return { baseLanes: e, cachePool: null, transitions: null };
}
function Jm(e, t, n) {
  var r = t.pendingProps, o = we.current, s = !1, i = (t.flags & 128) !== 0, a;
  if ((a = i) || (a = e !== null && e.memoizedState === null ? !1 : (o & 2) !== 0), a ? (s = !0, t.flags &= -129) : (e === null || e.memoizedState !== null) && (o |= 1), fe(we, o & 1), e === null)
    return uu(t), e = t.memoizedState, e !== null && (e = e.dehydrated, e !== null) ? (t.mode & 1 ? e.data === "$!" ? t.lanes = 8 : t.lanes = 1073741824 : t.lanes = 1, null) : (i = r.children, e = r.fallback, s ? (r = t.mode, s = t.child, i = { mode: "hidden", children: i }, !(r & 1) && s !== null ? (s.childLanes = 0, s.pendingProps = i) : s = Sa(i, r, 0, null), e = fr(e, r, n, null), s.return = t, e.return = t, s.sibling = e, t.child = s, t.child.memoizedState = gu(n), t.memoizedState = yu, e) : Mc(t, i));
  if (o = e.memoizedState, o !== null && (a = o.dehydrated, a !== null)) return gx(e, t, i, r, a, o, n);
  if (s) {
    s = r.fallback, i = t.mode, o = e.child, a = o.sibling;
    var l = { mode: "hidden", children: r.children };
    return !(i & 1) && t.child !== o ? (r = t.child, r.childLanes = 0, r.pendingProps = l, t.deletions = null) : (r = Wn(o, l), r.subtreeFlags = o.subtreeFlags & 14680064), a !== null ? s = Wn(a, s) : (s = fr(s, i, n, null), s.flags |= 2), s.return = t, r.return = t, r.sibling = s, t.child = r, r = s, s = t.child, i = e.child.memoizedState, i = i === null ? gu(n) : { baseLanes: i.baseLanes | n, cachePool: null, transitions: i.transitions }, s.memoizedState = i, s.childLanes = e.childLanes & ~n, t.memoizedState = yu, r;
  }
  return s = e.child, e = s.sibling, r = Wn(s, { mode: "visible", children: r.children }), !(t.mode & 1) && (r.lanes = n), r.return = t, r.sibling = null, e !== null && (n = t.deletions, n === null ? (t.deletions = [e], t.flags |= 16) : n.push(e)), t.child = r, t.memoizedState = null, r;
}
function Mc(e, t) {
  return t = Sa({ mode: "visible", children: t }, e.mode, 0, null), t.return = e, e.child = t;
}
function Fs(e, t, n, r) {
  return r !== null && wc(r), eo(t, e.child, null, n), e = Mc(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
}
function gx(e, t, n, r, o, s, i) {
  if (n)
    return t.flags & 256 ? (t.flags &= -257, r = dl(Error(E(422))), Fs(e, t, i, r)) : t.memoizedState !== null ? (t.child = e.child, t.flags |= 128, null) : (s = r.fallback, o = t.mode, r = Sa({ mode: "visible", children: r.children }, o, 0, null), s = fr(s, o, i, null), s.flags |= 2, r.return = t, s.return = t, r.sibling = s, t.child = r, t.mode & 1 && eo(t, e.child, null, i), t.child.memoizedState = gu(i), t.memoizedState = yu, s);
  if (!(t.mode & 1)) return Fs(e, t, i, null);
  if (o.data === "$!") {
    if (r = o.nextSibling && o.nextSibling.dataset, r) var a = r.dgst;
    return r = a, s = Error(E(419)), r = dl(s, r, void 0), Fs(e, t, i, r);
  }
  if (a = (i & e.childLanes) !== 0, st || a) {
    if (r = Oe, r !== null) {
      switch (i & -i) {
        case 4:
          o = 2;
          break;
        case 16:
          o = 8;
          break;
        case 64:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
        case 67108864:
          o = 32;
          break;
        case 536870912:
          o = 268435456;
          break;
        default:
          o = 0;
      }
      o = o & (r.suspendedLanes | i) ? 0 : o, o !== 0 && o !== s.retryLane && (s.retryLane = o, yn(e, o), Bt(r, e, o, -1));
    }
    return Fc(), r = dl(Error(E(421))), Fs(e, t, i, r);
  }
  return o.data === "$?" ? (t.flags |= 128, t.child = e.child, t = Tx.bind(null, e), o._reactRetry = t, null) : (e = s.treeContext, xt = Fn(o.nextSibling), wt = t, ge = !0, Lt = null, e !== null && ($t[It++] = un, $t[It++] = cn, $t[It++] = mr, un = e.id, cn = e.overflow, mr = t), t = Mc(t, r.children), t.flags |= 4096, t);
}
function Of(e, t, n) {
  e.lanes |= t;
  var r = e.alternate;
  r !== null && (r.lanes |= t), cu(e.return, t, n);
}
function fl(e, t, n, r, o) {
  var s = e.memoizedState;
  s === null ? e.memoizedState = { isBackwards: t, rendering: null, renderingStartTime: 0, last: r, tail: n, tailMode: o } : (s.isBackwards = t, s.rendering = null, s.renderingStartTime = 0, s.last = r, s.tail = n, s.tailMode = o);
}
function qm(e, t, n) {
  var r = t.pendingProps, o = r.revealOrder, s = r.tail;
  if (Ze(e, t, r.children, n), r = we.current, r & 2) r = r & 1 | 2, t.flags |= 128;
  else {
    if (e !== null && e.flags & 128) e: for (e = t.child; e !== null; ) {
      if (e.tag === 13) e.memoizedState !== null && Of(e, n, t);
      else if (e.tag === 19) Of(e, n, t);
      else if (e.child !== null) {
        e.child.return = e, e = e.child;
        continue;
      }
      if (e === t) break e;
      for (; e.sibling === null; ) {
        if (e.return === null || e.return === t) break e;
        e = e.return;
      }
      e.sibling.return = e.return, e = e.sibling;
    }
    r &= 1;
  }
  if (fe(we, r), !(t.mode & 1)) t.memoizedState = null;
  else switch (o) {
    case "forwards":
      for (n = t.child, o = null; n !== null; ) e = n.alternate, e !== null && zi(e) === null && (o = n), n = n.sibling;
      n = o, n === null ? (o = t.child, t.child = null) : (o = n.sibling, n.sibling = null), fl(t, !1, o, n, s);
      break;
    case "backwards":
      for (n = null, o = t.child, t.child = null; o !== null; ) {
        if (e = o.alternate, e !== null && zi(e) === null) {
          t.child = o;
          break;
        }
        e = o.sibling, o.sibling = n, n = o, o = e;
      }
      fl(t, !0, n, null, s);
      break;
    case "together":
      fl(t, !1, null, null, void 0);
      break;
    default:
      t.memoizedState = null;
  }
  return t.child;
}
function si(e, t) {
  !(t.mode & 1) && e !== null && (e.alternate = null, t.alternate = null, t.flags |= 2);
}
function gn(e, t, n) {
  if (e !== null && (t.dependencies = e.dependencies), gr |= t.lanes, !(n & t.childLanes)) return null;
  if (e !== null && t.child !== e.child) throw Error(E(153));
  if (t.child !== null) {
    for (e = t.child, n = Wn(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null; ) e = e.sibling, n = n.sibling = Wn(e, e.pendingProps), n.return = t;
    n.sibling = null;
  }
  return t.child;
}
function vx(e, t, n) {
  switch (t.tag) {
    case 3:
      Xm(t), qr();
      break;
    case 5:
      Cm(t);
      break;
    case 1:
      lt(t.type) && Ni(t);
      break;
    case 4:
      Ec(t, t.stateNode.containerInfo);
      break;
    case 10:
      var r = t.type._context, o = t.memoizedProps.value;
      fe(Mi, r._currentValue), r._currentValue = o;
      break;
    case 13:
      if (r = t.memoizedState, r !== null)
        return r.dehydrated !== null ? (fe(we, we.current & 1), t.flags |= 128, null) : n & t.child.childLanes ? Jm(e, t, n) : (fe(we, we.current & 1), e = gn(e, t, n), e !== null ? e.sibling : null);
      fe(we, we.current & 1);
      break;
    case 19:
      if (r = (n & t.childLanes) !== 0, e.flags & 128) {
        if (r) return qm(e, t, n);
        t.flags |= 128;
      }
      if (o = t.memoizedState, o !== null && (o.rendering = null, o.tail = null, o.lastEffect = null), fe(we, we.current), r) break;
      return null;
    case 22:
    case 23:
      return t.lanes = 0, Ym(e, t, n);
  }
  return gn(e, t, n);
}
var ey, vu, ty, ny;
ey = function(e, t) {
  for (var n = t.child; n !== null; ) {
    if (n.tag === 5 || n.tag === 6) e.appendChild(n.stateNode);
    else if (n.tag !== 4 && n.child !== null) {
      n.child.return = n, n = n.child;
      continue;
    }
    if (n === t) break;
    for (; n.sibling === null; ) {
      if (n.return === null || n.return === t) return;
      n = n.return;
    }
    n.sibling.return = n.return, n = n.sibling;
  }
};
vu = function() {
};
ty = function(e, t, n, r) {
  var o = e.memoizedProps;
  if (o !== r) {
    e = t.stateNode, lr(tn.current);
    var s = null;
    switch (n) {
      case "input":
        o = Fl(e, o), r = Fl(e, r), s = [];
        break;
      case "select":
        o = Se({}, o, { value: void 0 }), r = Se({}, r, { value: void 0 }), s = [];
        break;
      case "textarea":
        o = Ul(e, o), r = Ul(e, r), s = [];
        break;
      default:
        typeof o.onClick != "function" && typeof r.onClick == "function" && (e.onclick = Ii);
    }
    Hl(n, r);
    var i;
    n = null;
    for (u in o) if (!r.hasOwnProperty(u) && o.hasOwnProperty(u) && o[u] != null) if (u === "style") {
      var a = o[u];
      for (i in a) a.hasOwnProperty(i) && (n || (n = {}), n[i] = "");
    } else u !== "dangerouslySetInnerHTML" && u !== "children" && u !== "suppressContentEditableWarning" && u !== "suppressHydrationWarning" && u !== "autoFocus" && (Qo.hasOwnProperty(u) ? s || (s = []) : (s = s || []).push(u, null));
    for (u in r) {
      var l = r[u];
      if (a = o?.[u], r.hasOwnProperty(u) && l !== a && (l != null || a != null)) if (u === "style") if (a) {
        for (i in a) !a.hasOwnProperty(i) || l && l.hasOwnProperty(i) || (n || (n = {}), n[i] = "");
        for (i in l) l.hasOwnProperty(i) && a[i] !== l[i] && (n || (n = {}), n[i] = l[i]);
      } else n || (s || (s = []), s.push(
        u,
        n
      )), n = l;
      else u === "dangerouslySetInnerHTML" ? (l = l ? l.__html : void 0, a = a ? a.__html : void 0, l != null && a !== l && (s = s || []).push(u, l)) : u === "children" ? typeof l != "string" && typeof l != "number" || (s = s || []).push(u, "" + l) : u !== "suppressContentEditableWarning" && u !== "suppressHydrationWarning" && (Qo.hasOwnProperty(u) ? (l != null && u === "onScroll" && he("scroll", e), s || a === l || (s = [])) : (s = s || []).push(u, l));
    }
    n && (s = s || []).push("style", n);
    var u = s;
    (t.updateQueue = u) && (t.flags |= 4);
  }
};
ny = function(e, t, n, r) {
  n !== r && (t.flags |= 4);
};
function So(e, t) {
  if (!ge) switch (e.tailMode) {
    case "hidden":
      t = e.tail;
      for (var n = null; t !== null; ) t.alternate !== null && (n = t), t = t.sibling;
      n === null ? e.tail = null : n.sibling = null;
      break;
    case "collapsed":
      n = e.tail;
      for (var r = null; n !== null; ) n.alternate !== null && (r = n), n = n.sibling;
      r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
  }
}
function Be(e) {
  var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
  if (t) for (var o = e.child; o !== null; ) n |= o.lanes | o.childLanes, r |= o.subtreeFlags & 14680064, r |= o.flags & 14680064, o.return = e, o = o.sibling;
  else for (o = e.child; o !== null; ) n |= o.lanes | o.childLanes, r |= o.subtreeFlags, r |= o.flags, o.return = e, o = o.sibling;
  return e.subtreeFlags |= r, e.childLanes = n, t;
}
function xx(e, t, n) {
  var r = t.pendingProps;
  switch (xc(t), t.tag) {
    case 2:
    case 16:
    case 15:
    case 0:
    case 11:
    case 7:
    case 8:
    case 12:
    case 9:
    case 14:
      return Be(t), null;
    case 1:
      return lt(t.type) && Ti(), Be(t), null;
    case 3:
      return r = t.stateNode, to(), ye(at), ye(We), $c(), r.pendingContext && (r.context = r.pendingContext, r.pendingContext = null), (e === null || e.child === null) && (As(t) ? t.flags |= 4 : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, Lt !== null && (Eu(Lt), Lt = null))), vu(e, t), Be(t), null;
    case 5:
      jc(t);
      var o = lr(ss.current);
      if (n = t.type, e !== null && t.stateNode != null) ty(e, t, n, r, o), e.ref !== t.ref && (t.flags |= 512, t.flags |= 2097152);
      else {
        if (!r) {
          if (t.stateNode === null) throw Error(E(166));
          return Be(t), null;
        }
        if (e = lr(tn.current), As(t)) {
          r = t.stateNode, n = t.type;
          var s = t.memoizedProps;
          switch (r[Jt] = t, r[rs] = s, e = (t.mode & 1) !== 0, n) {
            case "dialog":
              he("cancel", r), he("close", r);
              break;
            case "iframe":
            case "object":
            case "embed":
              he("load", r);
              break;
            case "video":
            case "audio":
              for (o = 0; o < $o.length; o++) he($o[o], r);
              break;
            case "source":
              he("error", r);
              break;
            case "img":
            case "image":
            case "link":
              he(
                "error",
                r
              ), he("load", r);
              break;
            case "details":
              he("toggle", r);
              break;
            case "input":
              Fd(r, s), he("invalid", r);
              break;
            case "select":
              r._wrapperState = { wasMultiple: !!s.multiple }, he("invalid", r);
              break;
            case "textarea":
              Vd(r, s), he("invalid", r);
          }
          Hl(n, s), o = null;
          for (var i in s) if (s.hasOwnProperty(i)) {
            var a = s[i];
            i === "children" ? typeof a == "string" ? r.textContent !== a && (s.suppressHydrationWarning !== !0 && zs(r.textContent, a, e), o = ["children", a]) : typeof a == "number" && r.textContent !== "" + a && (s.suppressHydrationWarning !== !0 && zs(
              r.textContent,
              a,
              e
            ), o = ["children", "" + a]) : Qo.hasOwnProperty(i) && a != null && i === "onScroll" && he("scroll", r);
          }
          switch (n) {
            case "input":
              Is(r), Bd(r, s, !0);
              break;
            case "textarea":
              Is(r), Ud(r);
              break;
            case "select":
            case "option":
              break;
            default:
              typeof s.onClick == "function" && (r.onclick = Ii);
          }
          r = o, t.updateQueue = r, r !== null && (t.flags |= 4);
        } else {
          i = o.nodeType === 9 ? o : o.ownerDocument, e === "http://www.w3.org/1999/xhtml" && (e = Th(n)), e === "http://www.w3.org/1999/xhtml" ? n === "script" ? (e = i.createElement("div"), e.innerHTML = "<script><\/script>", e = e.removeChild(e.firstChild)) : typeof r.is == "string" ? e = i.createElement(n, { is: r.is }) : (e = i.createElement(n), n === "select" && (i = e, r.multiple ? i.multiple = !0 : r.size && (i.size = r.size))) : e = i.createElementNS(e, n), e[Jt] = t, e[rs] = r, ey(e, t, !1, !1), t.stateNode = e;
          e: {
            switch (i = Zl(n, r), n) {
              case "dialog":
                he("cancel", e), he("close", e), o = r;
                break;
              case "iframe":
              case "object":
              case "embed":
                he("load", e), o = r;
                break;
              case "video":
              case "audio":
                for (o = 0; o < $o.length; o++) he($o[o], e);
                o = r;
                break;
              case "source":
                he("error", e), o = r;
                break;
              case "img":
              case "image":
              case "link":
                he(
                  "error",
                  e
                ), he("load", e), o = r;
                break;
              case "details":
                he("toggle", e), o = r;
                break;
              case "input":
                Fd(e, r), o = Fl(e, r), he("invalid", e);
                break;
              case "option":
                o = r;
                break;
              case "select":
                e._wrapperState = { wasMultiple: !!r.multiple }, o = Se({}, r, { value: void 0 }), he("invalid", e);
                break;
              case "textarea":
                Vd(e, r), o = Ul(e, r), he("invalid", e);
                break;
              default:
                o = r;
            }
            Hl(n, o), a = o;
            for (s in a) if (a.hasOwnProperty(s)) {
              var l = a[s];
              s === "style" ? Ph(e, l) : s === "dangerouslySetInnerHTML" ? (l = l ? l.__html : void 0, l != null && Nh(e, l)) : s === "children" ? typeof l == "string" ? (n !== "textarea" || l !== "") && Ko(e, l) : typeof l == "number" && Ko(e, "" + l) : s !== "suppressContentEditableWarning" && s !== "suppressHydrationWarning" && s !== "autoFocus" && (Qo.hasOwnProperty(s) ? l != null && s === "onScroll" && he("scroll", e) : l != null && oc(e, s, l, i));
            }
            switch (n) {
              case "input":
                Is(e), Bd(e, r, !1);
                break;
              case "textarea":
                Is(e), Ud(e);
                break;
              case "option":
                r.value != null && e.setAttribute("value", "" + Hn(r.value));
                break;
              case "select":
                e.multiple = !!r.multiple, s = r.value, s != null ? Hr(e, !!r.multiple, s, !1) : r.defaultValue != null && Hr(
                  e,
                  !!r.multiple,
                  r.defaultValue,
                  !0
                );
                break;
              default:
                typeof o.onClick == "function" && (e.onclick = Ii);
            }
            switch (n) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                r = !!r.autoFocus;
                break e;
              case "img":
                r = !0;
                break e;
              default:
                r = !1;
            }
          }
          r && (t.flags |= 4);
        }
        t.ref !== null && (t.flags |= 512, t.flags |= 2097152);
      }
      return Be(t), null;
    case 6:
      if (e && t.stateNode != null) ny(e, t, e.memoizedProps, r);
      else {
        if (typeof r != "string" && t.stateNode === null) throw Error(E(166));
        if (n = lr(ss.current), lr(tn.current), As(t)) {
          if (r = t.stateNode, n = t.memoizedProps, r[Jt] = t, (s = r.nodeValue !== n) && (e = wt, e !== null)) switch (e.tag) {
            case 3:
              zs(r.nodeValue, n, (e.mode & 1) !== 0);
              break;
            case 5:
              e.memoizedProps.suppressHydrationWarning !== !0 && zs(r.nodeValue, n, (e.mode & 1) !== 0);
          }
          s && (t.flags |= 4);
        } else r = (n.nodeType === 9 ? n : n.ownerDocument).createTextNode(r), r[Jt] = t, t.stateNode = r;
      }
      return Be(t), null;
    case 13:
      if (ye(we), r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
        if (ge && xt !== null && t.mode & 1 && !(t.flags & 128)) wm(), qr(), t.flags |= 98560, s = !1;
        else if (s = As(t), r !== null && r.dehydrated !== null) {
          if (e === null) {
            if (!s) throw Error(E(318));
            if (s = t.memoizedState, s = s !== null ? s.dehydrated : null, !s) throw Error(E(317));
            s[Jt] = t;
          } else qr(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
          Be(t), s = !1;
        } else Lt !== null && (Eu(Lt), Lt = null), s = !0;
        if (!s) return t.flags & 65536 ? t : null;
      }
      return t.flags & 128 ? (t.lanes = n, t) : (r = r !== null, r !== (e !== null && e.memoizedState !== null) && r && (t.child.flags |= 8192, t.mode & 1 && (e === null || we.current & 1 ? Te === 0 && (Te = 3) : Fc())), t.updateQueue !== null && (t.flags |= 4), Be(t), null);
    case 4:
      return to(), vu(e, t), e === null && ts(t.stateNode.containerInfo), Be(t), null;
    case 10:
      return bc(t.type._context), Be(t), null;
    case 17:
      return lt(t.type) && Ti(), Be(t), null;
    case 19:
      if (ye(we), s = t.memoizedState, s === null) return Be(t), null;
      if (r = (t.flags & 128) !== 0, i = s.rendering, i === null) if (r) So(s, !1);
      else {
        if (Te !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null; ) {
          if (i = zi(e), i !== null) {
            for (t.flags |= 128, So(s, !1), r = i.updateQueue, r !== null && (t.updateQueue = r, t.flags |= 4), t.subtreeFlags = 0, r = n, n = t.child; n !== null; ) s = n, e = r, s.flags &= 14680066, i = s.alternate, i === null ? (s.childLanes = 0, s.lanes = e, s.child = null, s.subtreeFlags = 0, s.memoizedProps = null, s.memoizedState = null, s.updateQueue = null, s.dependencies = null, s.stateNode = null) : (s.childLanes = i.childLanes, s.lanes = i.lanes, s.child = i.child, s.subtreeFlags = 0, s.deletions = null, s.memoizedProps = i.memoizedProps, s.memoizedState = i.memoizedState, s.updateQueue = i.updateQueue, s.type = i.type, e = i.dependencies, s.dependencies = e === null ? null : { lanes: e.lanes, firstContext: e.firstContext }), n = n.sibling;
            return fe(we, we.current & 1 | 2), t.child;
          }
          e = e.sibling;
        }
        s.tail !== null && Ee() > ro && (t.flags |= 128, r = !0, So(s, !1), t.lanes = 4194304);
      }
      else {
        if (!r) if (e = zi(i), e !== null) {
          if (t.flags |= 128, r = !0, n = e.updateQueue, n !== null && (t.updateQueue = n, t.flags |= 4), So(s, !0), s.tail === null && s.tailMode === "hidden" && !i.alternate && !ge) return Be(t), null;
        } else 2 * Ee() - s.renderingStartTime > ro && n !== 1073741824 && (t.flags |= 128, r = !0, So(s, !1), t.lanes = 4194304);
        s.isBackwards ? (i.sibling = t.child, t.child = i) : (n = s.last, n !== null ? n.sibling = i : t.child = i, s.last = i);
      }
      return s.tail !== null ? (t = s.tail, s.rendering = t, s.tail = t.sibling, s.renderingStartTime = Ee(), t.sibling = null, n = we.current, fe(we, r ? n & 1 | 2 : n & 1), t) : (Be(t), null);
    case 22:
    case 23:
      return Lc(), r = t.memoizedState !== null, e !== null && e.memoizedState !== null !== r && (t.flags |= 8192), r && t.mode & 1 ? pt & 1073741824 && (Be(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : Be(t), null;
    case 24:
      return null;
    case 25:
      return null;
  }
  throw Error(E(156, t.tag));
}
function wx(e, t) {
  switch (xc(t), t.tag) {
    case 1:
      return lt(t.type) && Ti(), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 3:
      return to(), ye(at), ye(We), $c(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
    case 5:
      return jc(t), null;
    case 13:
      if (ye(we), e = t.memoizedState, e !== null && e.dehydrated !== null) {
        if (t.alternate === null) throw Error(E(340));
        qr();
      }
      return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
    case 19:
      return ye(we), null;
    case 4:
      return to(), null;
    case 10:
      return bc(t.type._context), null;
    case 22:
    case 23:
      return Lc(), null;
    case 24:
      return null;
    default:
      return null;
  }
}
var Bs = !1, Ue = !1, kx = typeof WeakSet == "function" ? WeakSet : Set, D = null;
function Ur(e, t) {
  var n = e.ref;
  if (n !== null) if (typeof n == "function") try {
    n(null);
  } catch (r) {
    be(e, t, r);
  }
  else n.current = null;
}
function xu(e, t, n) {
  try {
    n();
  } catch (r) {
    be(e, t, r);
  }
}
var Pf = !1;
function Sx(e, t) {
  if (nu = Ei, e = am(), gc(e)) {
    if ("selectionStart" in e) var n = { start: e.selectionStart, end: e.selectionEnd };
    else e: {
      n = (n = e.ownerDocument) && n.defaultView || window;
      var r = n.getSelection && n.getSelection();
      if (r && r.rangeCount !== 0) {
        n = r.anchorNode;
        var o = r.anchorOffset, s = r.focusNode;
        r = r.focusOffset;
        try {
          n.nodeType, s.nodeType;
        } catch {
          n = null;
          break e;
        }
        var i = 0, a = -1, l = -1, u = 0, c = 0, p = e, g = null;
        t: for (; ; ) {
          for (var w; p !== n || o !== 0 && p.nodeType !== 3 || (a = i + o), p !== s || r !== 0 && p.nodeType !== 3 || (l = i + r), p.nodeType === 3 && (i += p.nodeValue.length), (w = p.firstChild) !== null; )
            g = p, p = w;
          for (; ; ) {
            if (p === e) break t;
            if (g === n && ++u === o && (a = i), g === s && ++c === r && (l = i), (w = p.nextSibling) !== null) break;
            p = g, g = p.parentNode;
          }
          p = w;
        }
        n = a === -1 || l === -1 ? null : { start: a, end: l };
      } else n = null;
    }
    n = n || { start: 0, end: 0 };
  } else n = null;
  for (ru = { focusedElem: e, selectionRange: n }, Ei = !1, D = t; D !== null; ) if (t = D, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null) e.return = t, D = e;
  else for (; D !== null; ) {
    t = D;
    try {
      var x = t.alternate;
      if (t.flags & 1024) switch (t.tag) {
        case 0:
        case 11:
        case 15:
          break;
        case 1:
          if (x !== null) {
            var k = x.memoizedProps, b = x.memoizedState, v = t.stateNode, f = v.getSnapshotBeforeUpdate(t.elementType === t.type ? k : zt(t.type, k), b);
            v.__reactInternalSnapshotBeforeUpdate = f;
          }
          break;
        case 3:
          var m = t.stateNode.containerInfo;
          m.nodeType === 1 ? m.textContent = "" : m.nodeType === 9 && m.documentElement && m.removeChild(m.documentElement);
          break;
        case 5:
        case 6:
        case 4:
        case 17:
          break;
        default:
          throw Error(E(163));
      }
    } catch (S) {
      be(t, t.return, S);
    }
    if (e = t.sibling, e !== null) {
      e.return = t.return, D = e;
      break;
    }
    D = t.return;
  }
  return x = Pf, Pf = !1, x;
}
function Fo(e, t, n) {
  var r = t.updateQueue;
  if (r = r !== null ? r.lastEffect : null, r !== null) {
    var o = r = r.next;
    do {
      if ((o.tag & e) === e) {
        var s = o.destroy;
        o.destroy = void 0, s !== void 0 && xu(t, n, s);
      }
      o = o.next;
    } while (o !== r);
  }
}
function wa(e, t) {
  if (t = t.updateQueue, t = t !== null ? t.lastEffect : null, t !== null) {
    var n = t = t.next;
    do {
      if ((n.tag & e) === e) {
        var r = n.create;
        n.destroy = r();
      }
      n = n.next;
    } while (n !== t);
  }
}
function wu(e) {
  var t = e.ref;
  if (t !== null) {
    var n = e.stateNode;
    switch (e.tag) {
      case 5:
        e = n;
        break;
      default:
        e = n;
    }
    typeof t == "function" ? t(e) : t.current = e;
  }
}
function ry(e) {
  var t = e.alternate;
  t !== null && (e.alternate = null, ry(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && (delete t[Jt], delete t[rs], delete t[iu], delete t[ox], delete t[sx])), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
}
function oy(e) {
  return e.tag === 5 || e.tag === 3 || e.tag === 4;
}
function Mf(e) {
  e: for (; ; ) {
    for (; e.sibling === null; ) {
      if (e.return === null || oy(e.return)) return null;
      e = e.return;
    }
    for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
      if (e.flags & 2 || e.child === null || e.tag === 4) continue e;
      e.child.return = e, e = e.child;
    }
    if (!(e.flags & 2)) return e.stateNode;
  }
}
function ku(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.nodeType === 8 ? n.parentNode.insertBefore(e, t) : n.insertBefore(e, t) : (n.nodeType === 8 ? (t = n.parentNode, t.insertBefore(e, n)) : (t = n, t.appendChild(e)), n = n._reactRootContainer, n != null || t.onclick !== null || (t.onclick = Ii));
  else if (r !== 4 && (e = e.child, e !== null)) for (ku(e, t, n), e = e.sibling; e !== null; ) ku(e, t, n), e = e.sibling;
}
function Su(e, t, n) {
  var r = e.tag;
  if (r === 5 || r === 6) e = e.stateNode, t ? n.insertBefore(e, t) : n.appendChild(e);
  else if (r !== 4 && (e = e.child, e !== null)) for (Su(e, t, n), e = e.sibling; e !== null; ) Su(e, t, n), e = e.sibling;
}
var Me = null, At = !1;
function bn(e, t, n) {
  for (n = n.child; n !== null; ) sy(e, t, n), n = n.sibling;
}
function sy(e, t, n) {
  if (en && typeof en.onCommitFiberUnmount == "function") try {
    en.onCommitFiberUnmount(fa, n);
  } catch {
  }
  switch (n.tag) {
    case 5:
      Ue || Ur(n, t);
    case 6:
      var r = Me, o = At;
      Me = null, bn(e, t, n), Me = r, At = o, Me !== null && (At ? (e = Me, n = n.stateNode, e.nodeType === 8 ? e.parentNode.removeChild(n) : e.removeChild(n)) : Me.removeChild(n.stateNode));
      break;
    case 18:
      Me !== null && (At ? (e = Me, n = n.stateNode, e.nodeType === 8 ? sl(e.parentNode, n) : e.nodeType === 1 && sl(e, n), Jo(e)) : sl(Me, n.stateNode));
      break;
    case 4:
      r = Me, o = At, Me = n.stateNode.containerInfo, At = !0, bn(e, t, n), Me = r, At = o;
      break;
    case 0:
    case 11:
    case 14:
    case 15:
      if (!Ue && (r = n.updateQueue, r !== null && (r = r.lastEffect, r !== null))) {
        o = r = r.next;
        do {
          var s = o, i = s.destroy;
          s = s.tag, i !== void 0 && (s & 2 || s & 4) && xu(n, t, i), o = o.next;
        } while (o !== r);
      }
      bn(e, t, n);
      break;
    case 1:
      if (!Ue && (Ur(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function")) try {
        r.props = n.memoizedProps, r.state = n.memoizedState, r.componentWillUnmount();
      } catch (a) {
        be(n, t, a);
      }
      bn(e, t, n);
      break;
    case 21:
      bn(e, t, n);
      break;
    case 22:
      n.mode & 1 ? (Ue = (r = Ue) || n.memoizedState !== null, bn(e, t, n), Ue = r) : bn(e, t, n);
      break;
    default:
      bn(e, t, n);
  }
}
function Rf(e) {
  var t = e.updateQueue;
  if (t !== null) {
    e.updateQueue = null;
    var n = e.stateNode;
    n === null && (n = e.stateNode = new kx()), t.forEach(function(r) {
      var o = Nx.bind(null, e, r);
      n.has(r) || (n.add(r), r.then(o, o));
    });
  }
}
function Dt(e, t) {
  var n = t.deletions;
  if (n !== null) for (var r = 0; r < n.length; r++) {
    var o = n[r];
    try {
      var s = e, i = t, a = i;
      e: for (; a !== null; ) {
        switch (a.tag) {
          case 5:
            Me = a.stateNode, At = !1;
            break e;
          case 3:
            Me = a.stateNode.containerInfo, At = !0;
            break e;
          case 4:
            Me = a.stateNode.containerInfo, At = !0;
            break e;
        }
        a = a.return;
      }
      if (Me === null) throw Error(E(160));
      sy(s, i, o), Me = null, At = !1;
      var l = o.alternate;
      l !== null && (l.return = null), o.return = null;
    } catch (u) {
      be(o, t, u);
    }
  }
  if (t.subtreeFlags & 12854) for (t = t.child; t !== null; ) iy(t, e), t = t.sibling;
}
function iy(e, t) {
  var n = e.alternate, r = e.flags;
  switch (e.tag) {
    case 0:
    case 11:
    case 14:
    case 15:
      if (Dt(t, e), Qt(e), r & 4) {
        try {
          Fo(3, e, e.return), wa(3, e);
        } catch (k) {
          be(e, e.return, k);
        }
        try {
          Fo(5, e, e.return);
        } catch (k) {
          be(e, e.return, k);
        }
      }
      break;
    case 1:
      Dt(t, e), Qt(e), r & 512 && n !== null && Ur(n, n.return);
      break;
    case 5:
      if (Dt(t, e), Qt(e), r & 512 && n !== null && Ur(n, n.return), e.flags & 32) {
        var o = e.stateNode;
        try {
          Ko(o, "");
        } catch (k) {
          be(e, e.return, k);
        }
      }
      if (r & 4 && (o = e.stateNode, o != null)) {
        var s = e.memoizedProps, i = n !== null ? n.memoizedProps : s, a = e.type, l = e.updateQueue;
        if (e.updateQueue = null, l !== null) try {
          a === "input" && s.type === "radio" && s.name != null && $h(o, s), Zl(a, i);
          var u = Zl(a, s);
          for (i = 0; i < l.length; i += 2) {
            var c = l[i], p = l[i + 1];
            c === "style" ? Ph(o, p) : c === "dangerouslySetInnerHTML" ? Nh(o, p) : c === "children" ? Ko(o, p) : oc(o, c, p, u);
          }
          switch (a) {
            case "input":
              Bl(o, s);
              break;
            case "textarea":
              Ih(o, s);
              break;
            case "select":
              var g = o._wrapperState.wasMultiple;
              o._wrapperState.wasMultiple = !!s.multiple;
              var w = s.value;
              w != null ? Hr(o, !!s.multiple, w, !1) : g !== !!s.multiple && (s.defaultValue != null ? Hr(
                o,
                !!s.multiple,
                s.defaultValue,
                !0
              ) : Hr(o, !!s.multiple, s.multiple ? [] : "", !1));
          }
          o[rs] = s;
        } catch (k) {
          be(e, e.return, k);
        }
      }
      break;
    case 6:
      if (Dt(t, e), Qt(e), r & 4) {
        if (e.stateNode === null) throw Error(E(162));
        o = e.stateNode, s = e.memoizedProps;
        try {
          o.nodeValue = s;
        } catch (k) {
          be(e, e.return, k);
        }
      }
      break;
    case 3:
      if (Dt(t, e), Qt(e), r & 4 && n !== null && n.memoizedState.isDehydrated) try {
        Jo(t.containerInfo);
      } catch (k) {
        be(e, e.return, k);
      }
      break;
    case 4:
      Dt(t, e), Qt(e);
      break;
    case 13:
      Dt(t, e), Qt(e), o = e.child, o.flags & 8192 && (s = o.memoizedState !== null, o.stateNode.isHidden = s, !s || o.alternate !== null && o.alternate.memoizedState !== null || (zc = Ee())), r & 4 && Rf(e);
      break;
    case 22:
      if (c = n !== null && n.memoizedState !== null, e.mode & 1 ? (Ue = (u = Ue) || c, Dt(t, e), Ue = u) : Dt(t, e), Qt(e), r & 8192) {
        if (u = e.memoizedState !== null, (e.stateNode.isHidden = u) && !c && e.mode & 1) for (D = e, c = e.child; c !== null; ) {
          for (p = D = c; D !== null; ) {
            switch (g = D, w = g.child, g.tag) {
              case 0:
              case 11:
              case 14:
              case 15:
                Fo(4, g, g.return);
                break;
              case 1:
                Ur(g, g.return);
                var x = g.stateNode;
                if (typeof x.componentWillUnmount == "function") {
                  r = g, n = g.return;
                  try {
                    t = r, x.props = t.memoizedProps, x.state = t.memoizedState, x.componentWillUnmount();
                  } catch (k) {
                    be(r, n, k);
                  }
                }
                break;
              case 5:
                Ur(g, g.return);
                break;
              case 22:
                if (g.memoizedState !== null) {
                  zf(p);
                  continue;
                }
            }
            w !== null ? (w.return = g, D = w) : zf(p);
          }
          c = c.sibling;
        }
        e: for (c = null, p = e; ; ) {
          if (p.tag === 5) {
            if (c === null) {
              c = p;
              try {
                o = p.stateNode, u ? (s = o.style, typeof s.setProperty == "function" ? s.setProperty("display", "none", "important") : s.display = "none") : (a = p.stateNode, l = p.memoizedProps.style, i = l != null && l.hasOwnProperty("display") ? l.display : null, a.style.display = Oh("display", i));
              } catch (k) {
                be(e, e.return, k);
              }
            }
          } else if (p.tag === 6) {
            if (c === null) try {
              p.stateNode.nodeValue = u ? "" : p.memoizedProps;
            } catch (k) {
              be(e, e.return, k);
            }
          } else if ((p.tag !== 22 && p.tag !== 23 || p.memoizedState === null || p === e) && p.child !== null) {
            p.child.return = p, p = p.child;
            continue;
          }
          if (p === e) break e;
          for (; p.sibling === null; ) {
            if (p.return === null || p.return === e) break e;
            c === p && (c = null), p = p.return;
          }
          c === p && (c = null), p.sibling.return = p.return, p = p.sibling;
        }
      }
      break;
    case 19:
      Dt(t, e), Qt(e), r & 4 && Rf(e);
      break;
    case 21:
      break;
    default:
      Dt(
        t,
        e
      ), Qt(e);
  }
}
function Qt(e) {
  var t = e.flags;
  if (t & 2) {
    try {
      e: {
        for (var n = e.return; n !== null; ) {
          if (oy(n)) {
            var r = n;
            break e;
          }
          n = n.return;
        }
        throw Error(E(160));
      }
      switch (r.tag) {
        case 5:
          var o = r.stateNode;
          r.flags & 32 && (Ko(o, ""), r.flags &= -33);
          var s = Mf(e);
          Su(e, s, o);
          break;
        case 3:
        case 4:
          var i = r.stateNode.containerInfo, a = Mf(e);
          ku(e, a, i);
          break;
        default:
          throw Error(E(161));
      }
    } catch (l) {
      be(e, e.return, l);
    }
    e.flags &= -3;
  }
  t & 4096 && (e.flags &= -4097);
}
function bx(e, t, n) {
  D = e, ay(e);
}
function ay(e, t, n) {
  for (var r = (e.mode & 1) !== 0; D !== null; ) {
    var o = D, s = o.child;
    if (o.tag === 22 && r) {
      var i = o.memoizedState !== null || Bs;
      if (!i) {
        var a = o.alternate, l = a !== null && a.memoizedState !== null || Ue;
        a = Bs;
        var u = Ue;
        if (Bs = i, (Ue = l) && !u) for (D = o; D !== null; ) i = D, l = i.child, i.tag === 22 && i.memoizedState !== null ? Af(o) : l !== null ? (l.return = i, D = l) : Af(o);
        for (; s !== null; ) D = s, ay(s), s = s.sibling;
        D = o, Bs = a, Ue = u;
      }
      Df(e);
    } else o.subtreeFlags & 8772 && s !== null ? (s.return = o, D = s) : Df(e);
  }
}
function Df(e) {
  for (; D !== null; ) {
    var t = D;
    if (t.flags & 8772) {
      var n = t.alternate;
      try {
        if (t.flags & 8772) switch (t.tag) {
          case 0:
          case 11:
          case 15:
            Ue || wa(5, t);
            break;
          case 1:
            var r = t.stateNode;
            if (t.flags & 4 && !Ue) if (n === null) r.componentDidMount();
            else {
              var o = t.elementType === t.type ? n.memoizedProps : zt(t.type, n.memoizedProps);
              r.componentDidUpdate(o, n.memoizedState, r.__reactInternalSnapshotBeforeUpdate);
            }
            var s = t.updateQueue;
            s !== null && wf(t, s, r);
            break;
          case 3:
            var i = t.updateQueue;
            if (i !== null) {
              if (n = null, t.child !== null) switch (t.child.tag) {
                case 5:
                  n = t.child.stateNode;
                  break;
                case 1:
                  n = t.child.stateNode;
              }
              wf(t, i, n);
            }
            break;
          case 5:
            var a = t.stateNode;
            if (n === null && t.flags & 4) {
              n = a;
              var l = t.memoizedProps;
              switch (t.type) {
                case "button":
                case "input":
                case "select":
                case "textarea":
                  l.autoFocus && n.focus();
                  break;
                case "img":
                  l.src && (n.src = l.src);
              }
            }
            break;
          case 6:
            break;
          case 4:
            break;
          case 12:
            break;
          case 13:
            if (t.memoizedState === null) {
              var u = t.alternate;
              if (u !== null) {
                var c = u.memoizedState;
                if (c !== null) {
                  var p = c.dehydrated;
                  p !== null && Jo(p);
                }
              }
            }
            break;
          case 19:
          case 17:
          case 21:
          case 22:
          case 23:
          case 25:
            break;
          default:
            throw Error(E(163));
        }
        Ue || t.flags & 512 && wu(t);
      } catch (g) {
        be(t, t.return, g);
      }
    }
    if (t === e) {
      D = null;
      break;
    }
    if (n = t.sibling, n !== null) {
      n.return = t.return, D = n;
      break;
    }
    D = t.return;
  }
}
function zf(e) {
  for (; D !== null; ) {
    var t = D;
    if (t === e) {
      D = null;
      break;
    }
    var n = t.sibling;
    if (n !== null) {
      n.return = t.return, D = n;
      break;
    }
    D = t.return;
  }
}
function Af(e) {
  for (; D !== null; ) {
    var t = D;
    try {
      switch (t.tag) {
        case 0:
        case 11:
        case 15:
          var n = t.return;
          try {
            wa(4, t);
          } catch (l) {
            be(t, n, l);
          }
          break;
        case 1:
          var r = t.stateNode;
          if (typeof r.componentDidMount == "function") {
            var o = t.return;
            try {
              r.componentDidMount();
            } catch (l) {
              be(t, o, l);
            }
          }
          var s = t.return;
          try {
            wu(t);
          } catch (l) {
            be(t, s, l);
          }
          break;
        case 5:
          var i = t.return;
          try {
            wu(t);
          } catch (l) {
            be(t, i, l);
          }
      }
    } catch (l) {
      be(t, t.return, l);
    }
    if (t === e) {
      D = null;
      break;
    }
    var a = t.sibling;
    if (a !== null) {
      a.return = t.return, D = a;
      break;
    }
    D = t.return;
  }
}
var _x = Math.ceil, Fi = kn.ReactCurrentDispatcher, Rc = kn.ReactCurrentOwner, Nt = kn.ReactCurrentBatchConfig, se = 0, Oe = null, $e = null, De = 0, pt = 0, Wr = Yn(0), Te = 0, us = null, gr = 0, ka = 0, Dc = 0, Bo = null, ot = null, zc = 0, ro = 1 / 0, an = null, Bi = !1, bu = null, Vn = null, Vs = !1, Mn = null, Vi = 0, Vo = 0, _u = null, ii = -1, ai = 0;
function Ye() {
  return se & 6 ? Ee() : ii !== -1 ? ii : ii = Ee();
}
function Un(e) {
  return e.mode & 1 ? se & 2 && De !== 0 ? De & -De : ax.transition !== null ? (ai === 0 && (ai = Hh()), ai) : (e = ie, e !== 0 || (e = window.event, e = e === void 0 ? 16 : Jh(e.type)), e) : 1;
}
function Bt(e, t, n, r) {
  if (50 < Vo) throw Vo = 0, _u = null, Error(E(185));
  gs(e, n, r), (!(se & 2) || e !== Oe) && (e === Oe && (!(se & 2) && (ka |= n), Te === 4 && Nn(e, De)), ut(e, r), n === 1 && se === 0 && !(t.mode & 1) && (ro = Ee() + 500, ga && Gn()));
}
function ut(e, t) {
  var n = e.callbackNode;
  a0(e, t);
  var r = Ci(e, e === Oe ? De : 0);
  if (r === 0) n !== null && Zd(n), e.callbackNode = null, e.callbackPriority = 0;
  else if (t = r & -r, e.callbackPriority !== t) {
    if (n != null && Zd(n), t === 1) e.tag === 0 ? ix(Lf.bind(null, e)) : gm(Lf.bind(null, e)), nx(function() {
      !(se & 6) && Gn();
    }), n = null;
    else {
      switch (Zh(r)) {
        case 1:
          n = uc;
          break;
        case 4:
          n = Uh;
          break;
        case 16:
          n = _i;
          break;
        case 536870912:
          n = Wh;
          break;
        default:
          n = _i;
      }
      n = my(n, ly.bind(null, e));
    }
    e.callbackPriority = t, e.callbackNode = n;
  }
}
function ly(e, t) {
  if (ii = -1, ai = 0, se & 6) throw Error(E(327));
  var n = e.callbackNode;
  if (Gr() && e.callbackNode !== n) return null;
  var r = Ci(e, e === Oe ? De : 0);
  if (r === 0) return null;
  if (r & 30 || r & e.expiredLanes || t) t = Ui(e, r);
  else {
    t = r;
    var o = se;
    se |= 2;
    var s = cy();
    (Oe !== e || De !== t) && (an = null, ro = Ee() + 500, dr(e, t));
    do
      try {
        jx();
        break;
      } catch (a) {
        uy(e, a);
      }
    while (!0);
    Sc(), Fi.current = s, se = o, $e !== null ? t = 0 : (Oe = null, De = 0, t = Te);
  }
  if (t !== 0) {
    if (t === 2 && (o = Xl(e), o !== 0 && (r = o, t = Cu(e, o))), t === 1) throw n = us, dr(e, 0), Nn(e, r), ut(e, Ee()), n;
    if (t === 6) Nn(e, r);
    else {
      if (o = e.current.alternate, !(r & 30) && !Cx(o) && (t = Ui(e, r), t === 2 && (s = Xl(e), s !== 0 && (r = s, t = Cu(e, s))), t === 1)) throw n = us, dr(e, 0), Nn(e, r), ut(e, Ee()), n;
      switch (e.finishedWork = o, e.finishedLanes = r, t) {
        case 0:
        case 1:
          throw Error(E(345));
        case 2:
          nr(e, ot, an);
          break;
        case 3:
          if (Nn(e, r), (r & 130023424) === r && (t = zc + 500 - Ee(), 10 < t)) {
            if (Ci(e, 0) !== 0) break;
            if (o = e.suspendedLanes, (o & r) !== r) {
              Ye(), e.pingedLanes |= e.suspendedLanes & o;
              break;
            }
            e.timeoutHandle = su(nr.bind(null, e, ot, an), t);
            break;
          }
          nr(e, ot, an);
          break;
        case 4:
          if (Nn(e, r), (r & 4194240) === r) break;
          for (t = e.eventTimes, o = -1; 0 < r; ) {
            var i = 31 - Ft(r);
            s = 1 << i, i = t[i], i > o && (o = i), r &= ~s;
          }
          if (r = o, r = Ee() - r, r = (120 > r ? 120 : 480 > r ? 480 : 1080 > r ? 1080 : 1920 > r ? 1920 : 3e3 > r ? 3e3 : 4320 > r ? 4320 : 1960 * _x(r / 1960)) - r, 10 < r) {
            e.timeoutHandle = su(nr.bind(null, e, ot, an), r);
            break;
          }
          nr(e, ot, an);
          break;
        case 5:
          nr(e, ot, an);
          break;
        default:
          throw Error(E(329));
      }
    }
  }
  return ut(e, Ee()), e.callbackNode === n ? ly.bind(null, e) : null;
}
function Cu(e, t) {
  var n = Bo;
  return e.current.memoizedState.isDehydrated && (dr(e, t).flags |= 256), e = Ui(e, t), e !== 2 && (t = ot, ot = n, t !== null && Eu(t)), e;
}
function Eu(e) {
  ot === null ? ot = e : ot.push.apply(ot, e);
}
function Cx(e) {
  for (var t = e; ; ) {
    if (t.flags & 16384) {
      var n = t.updateQueue;
      if (n !== null && (n = n.stores, n !== null)) for (var r = 0; r < n.length; r++) {
        var o = n[r], s = o.getSnapshot;
        o = o.value;
        try {
          if (!Ut(s(), o)) return !1;
        } catch {
          return !1;
        }
      }
    }
    if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
    else {
      if (t === e) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === e) return !0;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
  }
  return !0;
}
function Nn(e, t) {
  for (t &= ~Dc, t &= ~ka, e.suspendedLanes |= t, e.pingedLanes &= ~t, e = e.expirationTimes; 0 < t; ) {
    var n = 31 - Ft(t), r = 1 << n;
    e[n] = -1, t &= ~r;
  }
}
function Lf(e) {
  if (se & 6) throw Error(E(327));
  Gr();
  var t = Ci(e, 0);
  if (!(t & 1)) return ut(e, Ee()), null;
  var n = Ui(e, t);
  if (e.tag !== 0 && n === 2) {
    var r = Xl(e);
    r !== 0 && (t = r, n = Cu(e, r));
  }
  if (n === 1) throw n = us, dr(e, 0), Nn(e, t), ut(e, Ee()), n;
  if (n === 6) throw Error(E(345));
  return e.finishedWork = e.current.alternate, e.finishedLanes = t, nr(e, ot, an), ut(e, Ee()), null;
}
function Ac(e, t) {
  var n = se;
  se |= 1;
  try {
    return e(t);
  } finally {
    se = n, se === 0 && (ro = Ee() + 500, ga && Gn());
  }
}
function vr(e) {
  Mn !== null && Mn.tag === 0 && !(se & 6) && Gr();
  var t = se;
  se |= 1;
  var n = Nt.transition, r = ie;
  try {
    if (Nt.transition = null, ie = 1, e) return e();
  } finally {
    ie = r, Nt.transition = n, se = t, !(se & 6) && Gn();
  }
}
function Lc() {
  pt = Wr.current, ye(Wr);
}
function dr(e, t) {
  e.finishedWork = null, e.finishedLanes = 0;
  var n = e.timeoutHandle;
  if (n !== -1 && (e.timeoutHandle = -1, tx(n)), $e !== null) for (n = $e.return; n !== null; ) {
    var r = n;
    switch (xc(r), r.tag) {
      case 1:
        r = r.type.childContextTypes, r != null && Ti();
        break;
      case 3:
        to(), ye(at), ye(We), $c();
        break;
      case 5:
        jc(r);
        break;
      case 4:
        to();
        break;
      case 13:
        ye(we);
        break;
      case 19:
        ye(we);
        break;
      case 10:
        bc(r.type._context);
        break;
      case 22:
      case 23:
        Lc();
    }
    n = n.return;
  }
  if (Oe = e, $e = e = Wn(e.current, null), De = pt = t, Te = 0, us = null, Dc = ka = gr = 0, ot = Bo = null, ar !== null) {
    for (t = 0; t < ar.length; t++) if (n = ar[t], r = n.interleaved, r !== null) {
      n.interleaved = null;
      var o = r.next, s = n.pending;
      if (s !== null) {
        var i = s.next;
        s.next = o, r.next = i;
      }
      n.pending = r;
    }
    ar = null;
  }
  return e;
}
function uy(e, t) {
  do {
    var n = $e;
    try {
      if (Sc(), ri.current = Li, Ai) {
        for (var r = ke.memoizedState; r !== null; ) {
          var o = r.queue;
          o !== null && (o.pending = null), r = r.next;
        }
        Ai = !1;
      }
      if (yr = 0, Ne = Ie = ke = null, Lo = !1, is = 0, Rc.current = null, n === null || n.return === null) {
        Te = 1, us = t, $e = null;
        break;
      }
      e: {
        var s = e, i = n.return, a = n, l = t;
        if (t = De, a.flags |= 32768, l !== null && typeof l == "object" && typeof l.then == "function") {
          var u = l, c = a, p = c.tag;
          if (!(c.mode & 1) && (p === 0 || p === 11 || p === 15)) {
            var g = c.alternate;
            g ? (c.updateQueue = g.updateQueue, c.memoizedState = g.memoizedState, c.lanes = g.lanes) : (c.updateQueue = null, c.memoizedState = null);
          }
          var w = Ef(i);
          if (w !== null) {
            w.flags &= -257, jf(w, i, a, s, t), w.mode & 1 && Cf(s, u, t), t = w, l = u;
            var x = t.updateQueue;
            if (x === null) {
              var k = /* @__PURE__ */ new Set();
              k.add(l), t.updateQueue = k;
            } else x.add(l);
            break e;
          } else {
            if (!(t & 1)) {
              Cf(s, u, t), Fc();
              break e;
            }
            l = Error(E(426));
          }
        } else if (ge && a.mode & 1) {
          var b = Ef(i);
          if (b !== null) {
            !(b.flags & 65536) && (b.flags |= 256), jf(b, i, a, s, t), wc(no(l, a));
            break e;
          }
        }
        s = l = no(l, a), Te !== 4 && (Te = 2), Bo === null ? Bo = [s] : Bo.push(s), s = i;
        do {
          switch (s.tag) {
            case 3:
              s.flags |= 65536, t &= -t, s.lanes |= t;
              var v = Zm(s, l, t);
              xf(s, v);
              break e;
            case 1:
              a = l;
              var f = s.type, m = s.stateNode;
              if (!(s.flags & 128) && (typeof f.getDerivedStateFromError == "function" || m !== null && typeof m.componentDidCatch == "function" && (Vn === null || !Vn.has(m)))) {
                s.flags |= 65536, t &= -t, s.lanes |= t;
                var S = Qm(s, a, t);
                xf(s, S);
                break e;
              }
          }
          s = s.return;
        } while (s !== null);
      }
      fy(n);
    } catch (_) {
      t = _, $e === n && n !== null && ($e = n = n.return);
      continue;
    }
    break;
  } while (!0);
}
function cy() {
  var e = Fi.current;
  return Fi.current = Li, e === null ? Li : e;
}
function Fc() {
  (Te === 0 || Te === 3 || Te === 2) && (Te = 4), Oe === null || !(gr & 268435455) && !(ka & 268435455) || Nn(Oe, De);
}
function Ui(e, t) {
  var n = se;
  se |= 2;
  var r = cy();
  (Oe !== e || De !== t) && (an = null, dr(e, t));
  do
    try {
      Ex();
      break;
    } catch (o) {
      uy(e, o);
    }
  while (!0);
  if (Sc(), se = n, Fi.current = r, $e !== null) throw Error(E(261));
  return Oe = null, De = 0, Te;
}
function Ex() {
  for (; $e !== null; ) dy($e);
}
function jx() {
  for (; $e !== null && !Jv(); ) dy($e);
}
function dy(e) {
  var t = hy(e.alternate, e, pt);
  e.memoizedProps = e.pendingProps, t === null ? fy(e) : $e = t, Rc.current = null;
}
function fy(e) {
  var t = e;
  do {
    var n = t.alternate;
    if (e = t.return, t.flags & 32768) {
      if (n = wx(n, t), n !== null) {
        n.flags &= 32767, $e = n;
        return;
      }
      if (e !== null) e.flags |= 32768, e.subtreeFlags = 0, e.deletions = null;
      else {
        Te = 6, $e = null;
        return;
      }
    } else if (n = xx(n, t, pt), n !== null) {
      $e = n;
      return;
    }
    if (t = t.sibling, t !== null) {
      $e = t;
      return;
    }
    $e = t = e;
  } while (t !== null);
  Te === 0 && (Te = 5);
}
function nr(e, t, n) {
  var r = ie, o = Nt.transition;
  try {
    Nt.transition = null, ie = 1, $x(e, t, n, r);
  } finally {
    Nt.transition = o, ie = r;
  }
  return null;
}
function $x(e, t, n, r) {
  do
    Gr();
  while (Mn !== null);
  if (se & 6) throw Error(E(327));
  n = e.finishedWork;
  var o = e.finishedLanes;
  if (n === null) return null;
  if (e.finishedWork = null, e.finishedLanes = 0, n === e.current) throw Error(E(177));
  e.callbackNode = null, e.callbackPriority = 0;
  var s = n.lanes | n.childLanes;
  if (l0(e, s), e === Oe && ($e = Oe = null, De = 0), !(n.subtreeFlags & 2064) && !(n.flags & 2064) || Vs || (Vs = !0, my(_i, function() {
    return Gr(), null;
  })), s = (n.flags & 15990) !== 0, n.subtreeFlags & 15990 || s) {
    s = Nt.transition, Nt.transition = null;
    var i = ie;
    ie = 1;
    var a = se;
    se |= 4, Rc.current = null, Sx(e, n), iy(n, e), K0(ru), Ei = !!nu, ru = nu = null, e.current = n, bx(n), qv(), se = a, ie = i, Nt.transition = s;
  } else e.current = n;
  if (Vs && (Vs = !1, Mn = e, Vi = o), s = e.pendingLanes, s === 0 && (Vn = null), n0(n.stateNode), ut(e, Ee()), t !== null) for (r = e.onRecoverableError, n = 0; n < t.length; n++) o = t[n], r(o.value, { componentStack: o.stack, digest: o.digest });
  if (Bi) throw Bi = !1, e = bu, bu = null, e;
  return Vi & 1 && e.tag !== 0 && Gr(), s = e.pendingLanes, s & 1 ? e === _u ? Vo++ : (Vo = 0, _u = e) : Vo = 0, Gn(), null;
}
function Gr() {
  if (Mn !== null) {
    var e = Zh(Vi), t = Nt.transition, n = ie;
    try {
      if (Nt.transition = null, ie = 16 > e ? 16 : e, Mn === null) var r = !1;
      else {
        if (e = Mn, Mn = null, Vi = 0, se & 6) throw Error(E(331));
        var o = se;
        for (se |= 4, D = e.current; D !== null; ) {
          var s = D, i = s.child;
          if (D.flags & 16) {
            var a = s.deletions;
            if (a !== null) {
              for (var l = 0; l < a.length; l++) {
                var u = a[l];
                for (D = u; D !== null; ) {
                  var c = D;
                  switch (c.tag) {
                    case 0:
                    case 11:
                    case 15:
                      Fo(8, c, s);
                  }
                  var p = c.child;
                  if (p !== null) p.return = c, D = p;
                  else for (; D !== null; ) {
                    c = D;
                    var g = c.sibling, w = c.return;
                    if (ry(c), c === u) {
                      D = null;
                      break;
                    }
                    if (g !== null) {
                      g.return = w, D = g;
                      break;
                    }
                    D = w;
                  }
                }
              }
              var x = s.alternate;
              if (x !== null) {
                var k = x.child;
                if (k !== null) {
                  x.child = null;
                  do {
                    var b = k.sibling;
                    k.sibling = null, k = b;
                  } while (k !== null);
                }
              }
              D = s;
            }
          }
          if (s.subtreeFlags & 2064 && i !== null) i.return = s, D = i;
          else e: for (; D !== null; ) {
            if (s = D, s.flags & 2048) switch (s.tag) {
              case 0:
              case 11:
              case 15:
                Fo(9, s, s.return);
            }
            var v = s.sibling;
            if (v !== null) {
              v.return = s.return, D = v;
              break e;
            }
            D = s.return;
          }
        }
        var f = e.current;
        for (D = f; D !== null; ) {
          i = D;
          var m = i.child;
          if (i.subtreeFlags & 2064 && m !== null) m.return = i, D = m;
          else e: for (i = f; D !== null; ) {
            if (a = D, a.flags & 2048) try {
              switch (a.tag) {
                case 0:
                case 11:
                case 15:
                  wa(9, a);
              }
            } catch (_) {
              be(a, a.return, _);
            }
            if (a === i) {
              D = null;
              break e;
            }
            var S = a.sibling;
            if (S !== null) {
              S.return = a.return, D = S;
              break e;
            }
            D = a.return;
          }
        }
        if (se = o, Gn(), en && typeof en.onPostCommitFiberRoot == "function") try {
          en.onPostCommitFiberRoot(fa, e);
        } catch {
        }
        r = !0;
      }
      return r;
    } finally {
      ie = n, Nt.transition = t;
    }
  }
  return !1;
}
function Ff(e, t, n) {
  t = no(n, t), t = Zm(e, t, 1), e = Bn(e, t, 1), t = Ye(), e !== null && (gs(e, 1, t), ut(e, t));
}
function be(e, t, n) {
  if (e.tag === 3) Ff(e, e, n);
  else for (; t !== null; ) {
    if (t.tag === 3) {
      Ff(t, e, n);
      break;
    } else if (t.tag === 1) {
      var r = t.stateNode;
      if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (Vn === null || !Vn.has(r))) {
        e = no(n, e), e = Qm(t, e, 1), t = Bn(t, e, 1), e = Ye(), t !== null && (gs(t, 1, e), ut(t, e));
        break;
      }
    }
    t = t.return;
  }
}
function Ix(e, t, n) {
  var r = e.pingCache;
  r !== null && r.delete(t), t = Ye(), e.pingedLanes |= e.suspendedLanes & n, Oe === e && (De & n) === n && (Te === 4 || Te === 3 && (De & 130023424) === De && 500 > Ee() - zc ? dr(e, 0) : Dc |= n), ut(e, t);
}
function py(e, t) {
  t === 0 && (e.mode & 1 ? (t = Os, Os <<= 1, !(Os & 130023424) && (Os = 4194304)) : t = 1);
  var n = Ye();
  e = yn(e, t), e !== null && (gs(e, t, n), ut(e, n));
}
function Tx(e) {
  var t = e.memoizedState, n = 0;
  t !== null && (n = t.retryLane), py(e, n);
}
function Nx(e, t) {
  var n = 0;
  switch (e.tag) {
    case 13:
      var r = e.stateNode, o = e.memoizedState;
      o !== null && (n = o.retryLane);
      break;
    case 19:
      r = e.stateNode;
      break;
    default:
      throw Error(E(314));
  }
  r !== null && r.delete(t), py(e, n);
}
var hy;
hy = function(e, t, n) {
  if (e !== null) if (e.memoizedProps !== t.pendingProps || at.current) st = !0;
  else {
    if (!(e.lanes & n) && !(t.flags & 128)) return st = !1, vx(e, t, n);
    st = !!(e.flags & 131072);
  }
  else st = !1, ge && t.flags & 1048576 && vm(t, Pi, t.index);
  switch (t.lanes = 0, t.tag) {
    case 2:
      var r = t.type;
      si(e, t), e = t.pendingProps;
      var o = Jr(t, We.current);
      Yr(t, n), o = Tc(null, t, r, e, o, n);
      var s = Nc();
      return t.flags |= 1, typeof o == "object" && o !== null && typeof o.render == "function" && o.$$typeof === void 0 ? (t.tag = 1, t.memoizedState = null, t.updateQueue = null, lt(r) ? (s = !0, Ni(t)) : s = !1, t.memoizedState = o.state !== null && o.state !== void 0 ? o.state : null, Cc(t), o.updater = xa, t.stateNode = o, o._reactInternals = t, fu(t, r, e, n), t = mu(null, t, r, !0, s, n)) : (t.tag = 0, ge && s && vc(t), Ze(null, t, o, n), t = t.child), t;
    case 16:
      r = t.elementType;
      e: {
        switch (si(e, t), e = t.pendingProps, o = r._init, r = o(r._payload), t.type = r, o = t.tag = Px(r), e = zt(r, e), o) {
          case 0:
            t = hu(null, t, r, e, n);
            break e;
          case 1:
            t = Tf(null, t, r, e, n);
            break e;
          case 11:
            t = $f(null, t, r, e, n);
            break e;
          case 14:
            t = If(null, t, r, zt(r.type, e), n);
            break e;
        }
        throw Error(E(
          306,
          r,
          ""
        ));
      }
      return t;
    case 0:
      return r = t.type, o = t.pendingProps, o = t.elementType === r ? o : zt(r, o), hu(e, t, r, o, n);
    case 1:
      return r = t.type, o = t.pendingProps, o = t.elementType === r ? o : zt(r, o), Tf(e, t, r, o, n);
    case 3:
      e: {
        if (Xm(t), e === null) throw Error(E(387));
        r = t.pendingProps, s = t.memoizedState, o = s.element, _m(e, t), Di(t, r, null, n);
        var i = t.memoizedState;
        if (r = i.element, s.isDehydrated) if (s = { element: r, isDehydrated: !1, cache: i.cache, pendingSuspenseBoundaries: i.pendingSuspenseBoundaries, transitions: i.transitions }, t.updateQueue.baseState = s, t.memoizedState = s, t.flags & 256) {
          o = no(Error(E(423)), t), t = Nf(e, t, r, n, o);
          break e;
        } else if (r !== o) {
          o = no(Error(E(424)), t), t = Nf(e, t, r, n, o);
          break e;
        } else for (xt = Fn(t.stateNode.containerInfo.firstChild), wt = t, ge = !0, Lt = null, n = Sm(t, null, r, n), t.child = n; n; ) n.flags = n.flags & -3 | 4096, n = n.sibling;
        else {
          if (qr(), r === o) {
            t = gn(e, t, n);
            break e;
          }
          Ze(e, t, r, n);
        }
        t = t.child;
      }
      return t;
    case 5:
      return Cm(t), e === null && uu(t), r = t.type, o = t.pendingProps, s = e !== null ? e.memoizedProps : null, i = o.children, ou(r, o) ? i = null : s !== null && ou(r, s) && (t.flags |= 32), Gm(e, t), Ze(e, t, i, n), t.child;
    case 6:
      return e === null && uu(t), null;
    case 13:
      return Jm(e, t, n);
    case 4:
      return Ec(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = eo(t, null, r, n) : Ze(e, t, r, n), t.child;
    case 11:
      return r = t.type, o = t.pendingProps, o = t.elementType === r ? o : zt(r, o), $f(e, t, r, o, n);
    case 7:
      return Ze(e, t, t.pendingProps, n), t.child;
    case 8:
      return Ze(e, t, t.pendingProps.children, n), t.child;
    case 12:
      return Ze(e, t, t.pendingProps.children, n), t.child;
    case 10:
      e: {
        if (r = t.type._context, o = t.pendingProps, s = t.memoizedProps, i = o.value, fe(Mi, r._currentValue), r._currentValue = i, s !== null) if (Ut(s.value, i)) {
          if (s.children === o.children && !at.current) {
            t = gn(e, t, n);
            break e;
          }
        } else for (s = t.child, s !== null && (s.return = t); s !== null; ) {
          var a = s.dependencies;
          if (a !== null) {
            i = s.child;
            for (var l = a.firstContext; l !== null; ) {
              if (l.context === r) {
                if (s.tag === 1) {
                  l = fn(-1, n & -n), l.tag = 2;
                  var u = s.updateQueue;
                  if (u !== null) {
                    u = u.shared;
                    var c = u.pending;
                    c === null ? l.next = l : (l.next = c.next, c.next = l), u.pending = l;
                  }
                }
                s.lanes |= n, l = s.alternate, l !== null && (l.lanes |= n), cu(
                  s.return,
                  n,
                  t
                ), a.lanes |= n;
                break;
              }
              l = l.next;
            }
          } else if (s.tag === 10) i = s.type === t.type ? null : s.child;
          else if (s.tag === 18) {
            if (i = s.return, i === null) throw Error(E(341));
            i.lanes |= n, a = i.alternate, a !== null && (a.lanes |= n), cu(i, n, t), i = s.sibling;
          } else i = s.child;
          if (i !== null) i.return = s;
          else for (i = s; i !== null; ) {
            if (i === t) {
              i = null;
              break;
            }
            if (s = i.sibling, s !== null) {
              s.return = i.return, i = s;
              break;
            }
            i = i.return;
          }
          s = i;
        }
        Ze(e, t, o.children, n), t = t.child;
      }
      return t;
    case 9:
      return o = t.type, r = t.pendingProps.children, Yr(t, n), o = Ot(o), r = r(o), t.flags |= 1, Ze(e, t, r, n), t.child;
    case 14:
      return r = t.type, o = zt(r, t.pendingProps), o = zt(r.type, o), If(e, t, r, o, n);
    case 15:
      return Km(e, t, t.type, t.pendingProps, n);
    case 17:
      return r = t.type, o = t.pendingProps, o = t.elementType === r ? o : zt(r, o), si(e, t), t.tag = 1, lt(r) ? (e = !0, Ni(t)) : e = !1, Yr(t, n), Hm(t, r, o), fu(t, r, o, n), mu(null, t, r, !0, e, n);
    case 19:
      return qm(e, t, n);
    case 22:
      return Ym(e, t, n);
  }
  throw Error(E(156, t.tag));
};
function my(e, t) {
  return Vh(e, t);
}
function Ox(e, t, n, r) {
  this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
}
function Tt(e, t, n, r) {
  return new Ox(e, t, n, r);
}
function Bc(e) {
  return e = e.prototype, !(!e || !e.isReactComponent);
}
function Px(e) {
  if (typeof e == "function") return Bc(e) ? 1 : 0;
  if (e != null) {
    if (e = e.$$typeof, e === ic) return 11;
    if (e === ac) return 14;
  }
  return 2;
}
function Wn(e, t) {
  var n = e.alternate;
  return n === null ? (n = Tt(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null), n.flags = e.flags & 14680064, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n;
}
function li(e, t, n, r, o, s) {
  var i = 2;
  if (r = e, typeof e == "function") Bc(e) && (i = 1);
  else if (typeof e == "string") i = 5;
  else e: switch (e) {
    case Mr:
      return fr(n.children, o, s, t);
    case sc:
      i = 8, o |= 8;
      break;
    case Dl:
      return e = Tt(12, n, t, o | 2), e.elementType = Dl, e.lanes = s, e;
    case zl:
      return e = Tt(13, n, t, o), e.elementType = zl, e.lanes = s, e;
    case Al:
      return e = Tt(19, n, t, o), e.elementType = Al, e.lanes = s, e;
    case Ch:
      return Sa(n, o, s, t);
    default:
      if (typeof e == "object" && e !== null) switch (e.$$typeof) {
        case bh:
          i = 10;
          break e;
        case _h:
          i = 9;
          break e;
        case ic:
          i = 11;
          break e;
        case ac:
          i = 14;
          break e;
        case jn:
          i = 16, r = null;
          break e;
      }
      throw Error(E(130, e == null ? e : typeof e, ""));
  }
  return t = Tt(i, n, t, o), t.elementType = e, t.type = r, t.lanes = s, t;
}
function fr(e, t, n, r) {
  return e = Tt(7, e, r, t), e.lanes = n, e;
}
function Sa(e, t, n, r) {
  return e = Tt(22, e, r, t), e.elementType = Ch, e.lanes = n, e.stateNode = { isHidden: !1 }, e;
}
function pl(e, t, n) {
  return e = Tt(6, e, null, t), e.lanes = n, e;
}
function hl(e, t, n) {
  return t = Tt(4, e.children !== null ? e.children : [], e.key, t), t.lanes = n, t.stateNode = { containerInfo: e.containerInfo, pendingChildren: null, implementation: e.implementation }, t;
}
function Mx(e, t, n, r, o) {
  this.tag = t, this.containerInfo = e, this.finishedWork = this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.pendingContext = this.context = null, this.callbackPriority = 0, this.eventTimes = Ka(0), this.expirationTimes = Ka(-1), this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Ka(0), this.identifierPrefix = r, this.onRecoverableError = o, this.mutableSourceEagerHydrationData = null;
}
function Vc(e, t, n, r, o, s, i, a, l) {
  return e = new Mx(e, t, n, a, l), t === 1 ? (t = 1, s === !0 && (t |= 8)) : t = 0, s = Tt(3, null, null, t), e.current = s, s.stateNode = e, s.memoizedState = { element: r, isDehydrated: n, cache: null, transitions: null, pendingSuspenseBoundaries: null }, Cc(s), e;
}
function Rx(e, t, n) {
  var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
  return { $$typeof: Pr, key: r == null ? null : "" + r, children: e, containerInfo: t, implementation: n };
}
function yy(e) {
  if (!e) return Zn;
  e = e._reactInternals;
  e: {
    if (_r(e) !== e || e.tag !== 1) throw Error(E(170));
    var t = e;
    do {
      switch (t.tag) {
        case 3:
          t = t.stateNode.context;
          break e;
        case 1:
          if (lt(t.type)) {
            t = t.stateNode.__reactInternalMemoizedMergedChildContext;
            break e;
          }
      }
      t = t.return;
    } while (t !== null);
    throw Error(E(171));
  }
  if (e.tag === 1) {
    var n = e.type;
    if (lt(n)) return ym(e, n, t);
  }
  return t;
}
function gy(e, t, n, r, o, s, i, a, l) {
  return e = Vc(n, r, !0, e, o, s, i, a, l), e.context = yy(null), n = e.current, r = Ye(), o = Un(n), s = fn(r, o), s.callback = t ?? null, Bn(n, s, o), e.current.lanes = o, gs(e, o, r), ut(e, r), e;
}
function ba(e, t, n, r) {
  var o = t.current, s = Ye(), i = Un(o);
  return n = yy(n), t.context === null ? t.context = n : t.pendingContext = n, t = fn(s, i), t.payload = { element: e }, r = r === void 0 ? null : r, r !== null && (t.callback = r), e = Bn(o, t, i), e !== null && (Bt(e, o, i, s), ni(e, o, i)), i;
}
function Wi(e) {
  if (e = e.current, !e.child) return null;
  switch (e.child.tag) {
    case 5:
      return e.child.stateNode;
    default:
      return e.child.stateNode;
  }
}
function Bf(e, t) {
  if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
    var n = e.retryLane;
    e.retryLane = n !== 0 && n < t ? n : t;
  }
}
function Uc(e, t) {
  Bf(e, t), (e = e.alternate) && Bf(e, t);
}
function Dx() {
  return null;
}
var vy = typeof reportError == "function" ? reportError : function(e) {
  console.error(e);
};
function Wc(e) {
  this._internalRoot = e;
}
_a.prototype.render = Wc.prototype.render = function(e) {
  var t = this._internalRoot;
  if (t === null) throw Error(E(409));
  ba(e, t, null, null);
};
_a.prototype.unmount = Wc.prototype.unmount = function() {
  var e = this._internalRoot;
  if (e !== null) {
    this._internalRoot = null;
    var t = e.containerInfo;
    vr(function() {
      ba(null, e, null, null);
    }), t[mn] = null;
  }
};
function _a(e) {
  this._internalRoot = e;
}
_a.prototype.unstable_scheduleHydration = function(e) {
  if (e) {
    var t = Yh();
    e = { blockedOn: null, target: e, priority: t };
    for (var n = 0; n < Tn.length && t !== 0 && t < Tn[n].priority; n++) ;
    Tn.splice(n, 0, e), n === 0 && Xh(e);
  }
};
function Hc(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
}
function Ca(e) {
  return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11 && (e.nodeType !== 8 || e.nodeValue !== " react-mount-point-unstable "));
}
function Vf() {
}
function zx(e, t, n, r, o) {
  if (o) {
    if (typeof r == "function") {
      var s = r;
      r = function() {
        var u = Wi(i);
        s.call(u);
      };
    }
    var i = gy(t, r, e, 0, null, !1, !1, "", Vf);
    return e._reactRootContainer = i, e[mn] = i.current, ts(e.nodeType === 8 ? e.parentNode : e), vr(), i;
  }
  for (; o = e.lastChild; ) e.removeChild(o);
  if (typeof r == "function") {
    var a = r;
    r = function() {
      var u = Wi(l);
      a.call(u);
    };
  }
  var l = Vc(e, 0, !1, null, null, !1, !1, "", Vf);
  return e._reactRootContainer = l, e[mn] = l.current, ts(e.nodeType === 8 ? e.parentNode : e), vr(function() {
    ba(t, l, n, r);
  }), l;
}
function Ea(e, t, n, r, o) {
  var s = n._reactRootContainer;
  if (s) {
    var i = s;
    if (typeof o == "function") {
      var a = o;
      o = function() {
        var l = Wi(i);
        a.call(l);
      };
    }
    ba(t, i, e, o);
  } else i = zx(n, t, e, o, r);
  return Wi(i);
}
Qh = function(e) {
  switch (e.tag) {
    case 3:
      var t = e.stateNode;
      if (t.current.memoizedState.isDehydrated) {
        var n = jo(t.pendingLanes);
        n !== 0 && (cc(t, n | 1), ut(t, Ee()), !(se & 6) && (ro = Ee() + 500, Gn()));
      }
      break;
    case 13:
      vr(function() {
        var r = yn(e, 1);
        if (r !== null) {
          var o = Ye();
          Bt(r, e, 1, o);
        }
      }), Uc(e, 1);
  }
};
dc = function(e) {
  if (e.tag === 13) {
    var t = yn(e, 134217728);
    if (t !== null) {
      var n = Ye();
      Bt(t, e, 134217728, n);
    }
    Uc(e, 134217728);
  }
};
Kh = function(e) {
  if (e.tag === 13) {
    var t = Un(e), n = yn(e, t);
    if (n !== null) {
      var r = Ye();
      Bt(n, e, t, r);
    }
    Uc(e, t);
  }
};
Yh = function() {
  return ie;
};
Gh = function(e, t) {
  var n = ie;
  try {
    return ie = e, t();
  } finally {
    ie = n;
  }
};
Kl = function(e, t, n) {
  switch (t) {
    case "input":
      if (Bl(e, n), t = n.name, n.type === "radio" && t != null) {
        for (n = e; n.parentNode; ) n = n.parentNode;
        for (n = n.querySelectorAll("input[name=" + JSON.stringify("" + t) + '][type="radio"]'), t = 0; t < n.length; t++) {
          var r = n[t];
          if (r !== e && r.form === e.form) {
            var o = ya(r);
            if (!o) throw Error(E(90));
            jh(r), Bl(r, o);
          }
        }
      }
      break;
    case "textarea":
      Ih(e, n);
      break;
    case "select":
      t = n.value, t != null && Hr(e, !!n.multiple, t, !1);
  }
};
Dh = Ac;
zh = vr;
var Ax = { usingClientEntryPoint: !1, Events: [xs, Ar, ya, Mh, Rh, Ac] }, bo = { findFiberByHostInstance: ir, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" }, Lx = { bundleType: bo.bundleType, version: bo.version, rendererPackageName: bo.rendererPackageName, rendererConfig: bo.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: kn.ReactCurrentDispatcher, findHostInstanceByFiber: function(e) {
  return e = Fh(e), e === null ? null : e.stateNode;
}, findFiberByHostInstance: bo.findFiberByHostInstance || Dx, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
  var Us = __REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!Us.isDisabled && Us.supportsFiber) try {
    fa = Us.inject(Lx), en = Us;
  } catch {
  }
}
bt.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = Ax;
bt.createPortal = function(e, t) {
  var n = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
  if (!Hc(t)) throw Error(E(200));
  return Rx(e, t, null, n);
};
bt.createRoot = function(e, t) {
  if (!Hc(e)) throw Error(E(299));
  var n = !1, r = "", o = vy;
  return t != null && (t.unstable_strictMode === !0 && (n = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onRecoverableError !== void 0 && (o = t.onRecoverableError)), t = Vc(e, 1, !1, null, null, n, !1, r, o), e[mn] = t.current, ts(e.nodeType === 8 ? e.parentNode : e), new Wc(t);
};
bt.findDOMNode = function(e) {
  if (e == null) return null;
  if (e.nodeType === 1) return e;
  var t = e._reactInternals;
  if (t === void 0)
    throw typeof e.render == "function" ? Error(E(188)) : (e = Object.keys(e).join(","), Error(E(268, e)));
  return e = Fh(t), e = e === null ? null : e.stateNode, e;
};
bt.flushSync = function(e) {
  return vr(e);
};
bt.hydrate = function(e, t, n) {
  if (!Ca(t)) throw Error(E(200));
  return Ea(null, e, t, !0, n);
};
bt.hydrateRoot = function(e, t, n) {
  if (!Hc(e)) throw Error(E(405));
  var r = n != null && n.hydratedSources || null, o = !1, s = "", i = vy;
  if (n != null && (n.unstable_strictMode === !0 && (o = !0), n.identifierPrefix !== void 0 && (s = n.identifierPrefix), n.onRecoverableError !== void 0 && (i = n.onRecoverableError)), t = gy(t, null, e, 1, n ?? null, o, !1, s, i), e[mn] = t.current, ts(e), r) for (e = 0; e < r.length; e++) n = r[e], o = n._getVersion, o = o(n._source), t.mutableSourceEagerHydrationData == null ? t.mutableSourceEagerHydrationData = [n, o] : t.mutableSourceEagerHydrationData.push(
    n,
    o
  );
  return new _a(t);
};
bt.render = function(e, t, n) {
  if (!Ca(t)) throw Error(E(200));
  return Ea(null, e, t, !1, n);
};
bt.unmountComponentAtNode = function(e) {
  if (!Ca(e)) throw Error(E(40));
  return e._reactRootContainer ? (vr(function() {
    Ea(null, null, e, !1, function() {
      e._reactRootContainer = null, e[mn] = null;
    });
  }), !0) : !1;
};
bt.unstable_batchedUpdates = Ac;
bt.unstable_renderSubtreeIntoContainer = function(e, t, n, r) {
  if (!Ca(n)) throw Error(E(200));
  if (e == null || e._reactInternals === void 0) throw Error(E(38));
  return Ea(e, t, n, !1, r);
};
bt.version = "18.3.1-next-f1338f8080-20240426";
function xy() {
  if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function"))
    try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(xy);
    } catch (e) {
      console.error(e);
    }
}
xy(), xh.exports = bt;
var Fx = xh.exports, wy, Uf = Fx;
wy = Uf.createRoot, Uf.hydrateRoot;
const ky = 1, Rb = {
  createBoard: !1,
  editBoard: !1,
  deleteBoard: !1,
  shareToGroup: !1,
  shareToTeam: !1,
  manageClubTemplates: !1,
  attachToSession: !1,
  attachToMatch: !1,
  sendMessage: !1
};
function Sy(e = {}) {
  return {
    contractVersion: ky,
    user: { id: "local", displayName: "This device" },
    scope: { club: { id: "local", name: "This device" } },
    capabilities: {
      createBoard: !0,
      editBoard: !0,
      deleteBoard: !0,
      shareToGroup: !1,
      shareToTeam: !1,
      manageClubTemplates: !1,
      attachToSession: !1,
      attachToMatch: !1,
      sendMessage: !1
    },
    ...e
  };
}
function by(e) {
  const t = {
    id: e.id,
    name: e.metadata.name,
    kind: e.metadata.kind,
    description: e.metadata.description,
    favourite: e.metadata.favourite,
    createdAt: e.metadata.createdAt,
    updatedAt: e.metadata.updatedAt,
    scope: e.metadata.scope,
    revision: e.revision,
    stepCount: e.steps.length,
    objectCount: e.objects.length
  };
  return e.metadata.teamId && (t.teamId = e.metadata.teamId), e.metadata.groupId && (t.groupId = e.metadata.groupId), t;
}
var oe;
(function(e) {
  e.assertEqual = (o) => {
  };
  function t(o) {
  }
  e.assertIs = t;
  function n(o) {
    throw new Error();
  }
  e.assertNever = n, e.arrayToEnum = (o) => {
    const s = {};
    for (const i of o)
      s[i] = i;
    return s;
  }, e.getValidEnumValues = (o) => {
    const s = e.objectKeys(o).filter((a) => typeof o[o[a]] != "number"), i = {};
    for (const a of s)
      i[a] = o[a];
    return e.objectValues(i);
  }, e.objectValues = (o) => e.objectKeys(o).map(function(s) {
    return o[s];
  }), e.objectKeys = typeof Object.keys == "function" ? (o) => Object.keys(o) : (o) => {
    const s = [];
    for (const i in o)
      Object.prototype.hasOwnProperty.call(o, i) && s.push(i);
    return s;
  }, e.find = (o, s) => {
    for (const i of o)
      if (s(i))
        return i;
  }, e.isInteger = typeof Number.isInteger == "function" ? (o) => Number.isInteger(o) : (o) => typeof o == "number" && Number.isFinite(o) && Math.floor(o) === o;
  function r(o, s = " | ") {
    return o.map((i) => typeof i == "string" ? `'${i}'` : i).join(s);
  }
  e.joinValues = r, e.jsonStringifyReplacer = (o, s) => typeof s == "bigint" ? s.toString() : s;
})(oe || (oe = {}));
var Wf;
(function(e) {
  e.mergeShapes = (t, n) => ({
    ...t,
    ...n
    // second overwrites first
  });
})(Wf || (Wf = {}));
const z = oe.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]), In = (e) => {
  switch (typeof e) {
    case "undefined":
      return z.undefined;
    case "string":
      return z.string;
    case "number":
      return Number.isNaN(e) ? z.nan : z.number;
    case "boolean":
      return z.boolean;
    case "function":
      return z.function;
    case "bigint":
      return z.bigint;
    case "symbol":
      return z.symbol;
    case "object":
      return Array.isArray(e) ? z.array : e === null ? z.null : e.then && typeof e.then == "function" && e.catch && typeof e.catch == "function" ? z.promise : typeof Map < "u" && e instanceof Map ? z.map : typeof Set < "u" && e instanceof Set ? z.set : typeof Date < "u" && e instanceof Date ? z.date : z.object;
    default:
      return z.unknown;
  }
}, j = oe.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
class vn extends Error {
  get errors() {
    return this.issues;
  }
  constructor(t) {
    super(), this.issues = [], this.addIssue = (r) => {
      this.issues = [...this.issues, r];
    }, this.addIssues = (r = []) => {
      this.issues = [...this.issues, ...r];
    };
    const n = new.target.prototype;
    Object.setPrototypeOf ? Object.setPrototypeOf(this, n) : this.__proto__ = n, this.name = "ZodError", this.issues = t;
  }
  format(t) {
    const n = t || function(s) {
      return s.message;
    }, r = { _errors: [] }, o = (s) => {
      for (const i of s.issues)
        if (i.code === "invalid_union")
          i.unionErrors.map(o);
        else if (i.code === "invalid_return_type")
          o(i.returnTypeError);
        else if (i.code === "invalid_arguments")
          o(i.argumentsError);
        else if (i.path.length === 0)
          r._errors.push(n(i));
        else {
          let a = r, l = 0;
          for (; l < i.path.length; ) {
            const u = i.path[l];
            l === i.path.length - 1 ? (a[u] = a[u] || { _errors: [] }, a[u]._errors.push(n(i))) : a[u] = a[u] || { _errors: [] }, a = a[u], l++;
          }
        }
    };
    return o(this), r;
  }
  static assert(t) {
    if (!(t instanceof vn))
      throw new Error(`Not a ZodError: ${t}`);
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, oe.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(t = (n) => n.message) {
    const n = {}, r = [];
    for (const o of this.issues)
      if (o.path.length > 0) {
        const s = o.path[0];
        n[s] = n[s] || [], n[s].push(t(o));
      } else
        r.push(t(o));
    return { formErrors: r, fieldErrors: n };
  }
  get formErrors() {
    return this.flatten();
  }
}
vn.create = (e) => new vn(e);
const ju = (e, t) => {
  let n;
  switch (e.code) {
    case j.invalid_type:
      e.received === z.undefined ? n = "Required" : n = `Expected ${e.expected}, received ${e.received}`;
      break;
    case j.invalid_literal:
      n = `Invalid literal value, expected ${JSON.stringify(e.expected, oe.jsonStringifyReplacer)}`;
      break;
    case j.unrecognized_keys:
      n = `Unrecognized key(s) in object: ${oe.joinValues(e.keys, ", ")}`;
      break;
    case j.invalid_union:
      n = "Invalid input";
      break;
    case j.invalid_union_discriminator:
      n = `Invalid discriminator value. Expected ${oe.joinValues(e.options)}`;
      break;
    case j.invalid_enum_value:
      n = `Invalid enum value. Expected ${oe.joinValues(e.options)}, received '${e.received}'`;
      break;
    case j.invalid_arguments:
      n = "Invalid function arguments";
      break;
    case j.invalid_return_type:
      n = "Invalid function return type";
      break;
    case j.invalid_date:
      n = "Invalid date";
      break;
    case j.invalid_string:
      typeof e.validation == "object" ? "includes" in e.validation ? (n = `Invalid input: must include "${e.validation.includes}"`, typeof e.validation.position == "number" && (n = `${n} at one or more positions greater than or equal to ${e.validation.position}`)) : "startsWith" in e.validation ? n = `Invalid input: must start with "${e.validation.startsWith}"` : "endsWith" in e.validation ? n = `Invalid input: must end with "${e.validation.endsWith}"` : oe.assertNever(e.validation) : e.validation !== "regex" ? n = `Invalid ${e.validation}` : n = "Invalid";
      break;
    case j.too_small:
      e.type === "array" ? n = `Array must contain ${e.exact ? "exactly" : e.inclusive ? "at least" : "more than"} ${e.minimum} element(s)` : e.type === "string" ? n = `String must contain ${e.exact ? "exactly" : e.inclusive ? "at least" : "over"} ${e.minimum} character(s)` : e.type === "number" ? n = `Number must be ${e.exact ? "exactly equal to " : e.inclusive ? "greater than or equal to " : "greater than "}${e.minimum}` : e.type === "bigint" ? n = `Number must be ${e.exact ? "exactly equal to " : e.inclusive ? "greater than or equal to " : "greater than "}${e.minimum}` : e.type === "date" ? n = `Date must be ${e.exact ? "exactly equal to " : e.inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(e.minimum))}` : n = "Invalid input";
      break;
    case j.too_big:
      e.type === "array" ? n = `Array must contain ${e.exact ? "exactly" : e.inclusive ? "at most" : "less than"} ${e.maximum} element(s)` : e.type === "string" ? n = `String must contain ${e.exact ? "exactly" : e.inclusive ? "at most" : "under"} ${e.maximum} character(s)` : e.type === "number" ? n = `Number must be ${e.exact ? "exactly" : e.inclusive ? "less than or equal to" : "less than"} ${e.maximum}` : e.type === "bigint" ? n = `BigInt must be ${e.exact ? "exactly" : e.inclusive ? "less than or equal to" : "less than"} ${e.maximum}` : e.type === "date" ? n = `Date must be ${e.exact ? "exactly" : e.inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(e.maximum))}` : n = "Invalid input";
      break;
    case j.custom:
      n = "Invalid input";
      break;
    case j.invalid_intersection_types:
      n = "Intersection results could not be merged";
      break;
    case j.not_multiple_of:
      n = `Number must be a multiple of ${e.multipleOf}`;
      break;
    case j.not_finite:
      n = "Number must be finite";
      break;
    default:
      n = t.defaultError, oe.assertNever(e);
  }
  return { message: n };
};
let Bx = ju;
function Vx() {
  return Bx;
}
const Ux = (e) => {
  const { data: t, path: n, errorMaps: r, issueData: o } = e, s = [...n, ...o.path || []], i = {
    ...o,
    path: s
  };
  if (o.message !== void 0)
    return {
      ...o,
      path: s,
      message: o.message
    };
  let a = "";
  const l = r.filter((u) => !!u).slice().reverse();
  for (const u of l)
    a = u(i, { data: t, defaultError: a }).message;
  return {
    ...o,
    path: s,
    message: a
  };
};
function O(e, t) {
  const n = Vx(), r = Ux({
    issueData: t,
    data: e.data,
    path: e.path,
    errorMaps: [
      e.common.contextualErrorMap,
      // contextual error map is first priority
      e.schemaErrorMap,
      // then schema-bound map if available
      n,
      // then global override map
      n === ju ? void 0 : ju
      // then global default map
    ].filter((o) => !!o)
  });
  e.common.issues.push(r);
}
class Ge {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    this.value === "valid" && (this.value = "dirty");
  }
  abort() {
    this.value !== "aborted" && (this.value = "aborted");
  }
  static mergeArray(t, n) {
    const r = [];
    for (const o of n) {
      if (o.status === "aborted")
        return W;
      o.status === "dirty" && t.dirty(), r.push(o.value);
    }
    return { status: t.value, value: r };
  }
  static async mergeObjectAsync(t, n) {
    const r = [];
    for (const o of n) {
      const s = await o.key, i = await o.value;
      r.push({
        key: s,
        value: i
      });
    }
    return Ge.mergeObjectSync(t, r);
  }
  static mergeObjectSync(t, n) {
    const r = {};
    for (const o of n) {
      const { key: s, value: i } = o;
      if (s.status === "aborted" || i.status === "aborted")
        return W;
      s.status === "dirty" && t.dirty(), i.status === "dirty" && t.dirty(), s.value !== "__proto__" && (typeof i.value < "u" || o.alwaysSet) && (r[s.value] = i.value);
    }
    return { status: t.value, value: r };
  }
}
const W = Object.freeze({
  status: "aborted"
}), Io = (e) => ({ status: "dirty", value: e }), Mt = (e) => ({ status: "valid", value: e }), Hf = (e) => e.status === "aborted", Zf = (e) => e.status === "dirty", oo = (e) => e.status === "valid", Hi = (e) => typeof Promise < "u" && e instanceof Promise;
var L;
(function(e) {
  e.errToObj = (t) => typeof t == "string" ? { message: t } : t || {}, e.toString = (t) => typeof t == "string" ? t : t?.message;
})(L || (L = {}));
class rn {
  constructor(t, n, r, o) {
    this._cachedPath = [], this.parent = t, this.data = n, this._path = r, this._key = o;
  }
  get path() {
    return this._cachedPath.length || (Array.isArray(this._key) ? this._cachedPath.push(...this._path, ...this._key) : this._cachedPath.push(...this._path, this._key)), this._cachedPath;
  }
}
const Qf = (e, t) => {
  if (oo(t))
    return { success: !0, data: t.value };
  if (!e.common.issues.length)
    throw new Error("Validation failed but no issues detected.");
  return {
    success: !1,
    get error() {
      if (this._error)
        return this._error;
      const n = new vn(e.common.issues);
      return this._error = n, this._error;
    }
  };
};
function G(e) {
  if (!e)
    return {};
  const { errorMap: t, invalid_type_error: n, required_error: r, description: o } = e;
  if (t && (n || r))
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  return t ? { errorMap: t, description: o } : { errorMap: (i, a) => {
    const { message: l } = e;
    return i.code === "invalid_enum_value" ? { message: l ?? a.defaultError } : typeof a.data > "u" ? { message: l ?? r ?? a.defaultError } : i.code !== "invalid_type" ? { message: a.defaultError } : { message: l ?? n ?? a.defaultError };
  }, description: o };
}
class re {
  get description() {
    return this._def.description;
  }
  _getType(t) {
    return In(t.data);
  }
  _getOrReturnCtx(t, n) {
    return n || {
      common: t.parent.common,
      data: t.data,
      parsedType: In(t.data),
      schemaErrorMap: this._def.errorMap,
      path: t.path,
      parent: t.parent
    };
  }
  _processInputParams(t) {
    return {
      status: new Ge(),
      ctx: {
        common: t.parent.common,
        data: t.data,
        parsedType: In(t.data),
        schemaErrorMap: this._def.errorMap,
        path: t.path,
        parent: t.parent
      }
    };
  }
  _parseSync(t) {
    const n = this._parse(t);
    if (Hi(n))
      throw new Error("Synchronous parse encountered promise.");
    return n;
  }
  _parseAsync(t) {
    const n = this._parse(t);
    return Promise.resolve(n);
  }
  parse(t, n) {
    const r = this.safeParse(t, n);
    if (r.success)
      return r.data;
    throw r.error;
  }
  safeParse(t, n) {
    const r = {
      common: {
        issues: [],
        async: n?.async ?? !1,
        contextualErrorMap: n?.errorMap
      },
      path: n?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data: t,
      parsedType: In(t)
    }, o = this._parseSync({ data: t, path: r.path, parent: r });
    return Qf(r, o);
  }
  "~validate"(t) {
    const n = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data: t,
      parsedType: In(t)
    };
    if (!this["~standard"].async)
      try {
        const r = this._parseSync({ data: t, path: [], parent: n });
        return oo(r) ? {
          value: r.value
        } : {
          issues: n.common.issues
        };
      } catch (r) {
        r?.message?.toLowerCase()?.includes("encountered") && (this["~standard"].async = !0), n.common = {
          issues: [],
          async: !0
        };
      }
    return this._parseAsync({ data: t, path: [], parent: n }).then((r) => oo(r) ? {
      value: r.value
    } : {
      issues: n.common.issues
    });
  }
  async parseAsync(t, n) {
    const r = await this.safeParseAsync(t, n);
    if (r.success)
      return r.data;
    throw r.error;
  }
  async safeParseAsync(t, n) {
    const r = {
      common: {
        issues: [],
        contextualErrorMap: n?.errorMap,
        async: !0
      },
      path: n?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data: t,
      parsedType: In(t)
    }, o = this._parse({ data: t, path: r.path, parent: r }), s = await (Hi(o) ? o : Promise.resolve(o));
    return Qf(r, s);
  }
  refine(t, n) {
    const r = (o) => typeof n == "string" || typeof n > "u" ? { message: n } : typeof n == "function" ? n(o) : n;
    return this._refinement((o, s) => {
      const i = t(o), a = () => s.addIssue({
        code: j.custom,
        ...r(o)
      });
      return typeof Promise < "u" && i instanceof Promise ? i.then((l) => l ? !0 : (a(), !1)) : i ? !0 : (a(), !1);
    });
  }
  refinement(t, n) {
    return this._refinement((r, o) => t(r) ? !0 : (o.addIssue(typeof n == "function" ? n(r, o) : n), !1));
  }
  _refinement(t) {
    return new kr({
      schema: this,
      typeName: H.ZodEffects,
      effect: { type: "refinement", refinement: t }
    });
  }
  superRefine(t) {
    return this._refinement(t);
  }
  constructor(t) {
    this.spa = this.safeParseAsync, this._def = t, this.parse = this.parse.bind(this), this.safeParse = this.safeParse.bind(this), this.parseAsync = this.parseAsync.bind(this), this.safeParseAsync = this.safeParseAsync.bind(this), this.spa = this.spa.bind(this), this.refine = this.refine.bind(this), this.refinement = this.refinement.bind(this), this.superRefine = this.superRefine.bind(this), this.optional = this.optional.bind(this), this.nullable = this.nullable.bind(this), this.nullish = this.nullish.bind(this), this.array = this.array.bind(this), this.promise = this.promise.bind(this), this.or = this.or.bind(this), this.and = this.and.bind(this), this.transform = this.transform.bind(this), this.brand = this.brand.bind(this), this.default = this.default.bind(this), this.catch = this.catch.bind(this), this.describe = this.describe.bind(this), this.pipe = this.pipe.bind(this), this.readonly = this.readonly.bind(this), this.isNullable = this.isNullable.bind(this), this.isOptional = this.isOptional.bind(this), this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (n) => this["~validate"](n)
    };
  }
  optional() {
    return pn.create(this, this._def);
  }
  nullable() {
    return Sr.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return nn.create(this);
  }
  promise() {
    return Xi.create(this, this._def);
  }
  or(t) {
    return Qi.create([this, t], this._def);
  }
  and(t) {
    return Ki.create(this, t, this._def);
  }
  transform(t) {
    return new kr({
      ...G(this._def),
      schema: this,
      typeName: H.ZodEffects,
      effect: { type: "transform", transform: t }
    });
  }
  default(t) {
    const n = typeof t == "function" ? t : () => t;
    return new Ji({
      ...G(this._def),
      innerType: this,
      defaultValue: n,
      typeName: H.ZodDefault
    });
  }
  brand() {
    return new jy({
      typeName: H.ZodBranded,
      type: this,
      ...G(this._def)
    });
  }
  catch(t) {
    const n = typeof t == "function" ? t : () => t;
    return new qi({
      ...G(this._def),
      innerType: this,
      catchValue: n,
      typeName: H.ZodCatch
    });
  }
  describe(t) {
    const n = this.constructor;
    return new n({
      ...this._def,
      description: t
    });
  }
  pipe(t) {
    return Qc.create(this, t);
  }
  readonly() {
    return ea.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
const Wx = /^c[^\s-]{8,}$/i, Hx = /^[0-9a-z]+$/, Zx = /^[0-9A-HJKMNP-TV-Z]{26}$/i, Qx = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i, Kx = /^[a-z0-9_-]{21}$/i, Yx = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/, Gx = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/, Xx = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i, Jx = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
let ml;
const qx = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, e1 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/, t1 = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/, n1 = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/, r1 = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/, o1 = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/, _y = "((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))", s1 = new RegExp(`^${_y}$`);
function Cy(e) {
  let t = "[0-5]\\d";
  e.precision ? t = `${t}\\.\\d{${e.precision}}` : e.precision == null && (t = `${t}(\\.\\d+)?`);
  const n = e.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${t})${n}`;
}
function i1(e) {
  return new RegExp(`^${Cy(e)}$`);
}
function a1(e) {
  let t = `${_y}T${Cy(e)}`;
  const n = [];
  return n.push(e.local ? "Z?" : "Z"), e.offset && n.push("([+-]\\d{2}:?\\d{2})"), t = `${t}(${n.join("|")})`, new RegExp(`^${t}$`);
}
function l1(e, t) {
  return !!((t === "v4" || !t) && qx.test(e) || (t === "v6" || !t) && t1.test(e));
}
function u1(e, t) {
  if (!Yx.test(e))
    return !1;
  try {
    const [n] = e.split(".");
    if (!n)
      return !1;
    const r = n.replace(/-/g, "+").replace(/_/g, "/").padEnd(n.length + (4 - n.length % 4) % 4, "="), o = JSON.parse(atob(r));
    return !(typeof o != "object" || o === null || "typ" in o && o?.typ !== "JWT" || !o.alg || t && o.alg !== t);
  } catch {
    return !1;
  }
}
function c1(e, t) {
  return !!((t === "v4" || !t) && e1.test(e) || (t === "v6" || !t) && n1.test(e));
}
class dn extends re {
  _parse(t) {
    if (this._def.coerce && (t.data = String(t.data)), this._getType(t) !== z.string) {
      const s = this._getOrReturnCtx(t);
      return O(s, {
        code: j.invalid_type,
        expected: z.string,
        received: s.parsedType
      }), W;
    }
    const r = new Ge();
    let o;
    for (const s of this._def.checks)
      if (s.kind === "min")
        t.data.length < s.value && (o = this._getOrReturnCtx(t, o), O(o, {
          code: j.too_small,
          minimum: s.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: s.message
        }), r.dirty());
      else if (s.kind === "max")
        t.data.length > s.value && (o = this._getOrReturnCtx(t, o), O(o, {
          code: j.too_big,
          maximum: s.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: s.message
        }), r.dirty());
      else if (s.kind === "length") {
        const i = t.data.length > s.value, a = t.data.length < s.value;
        (i || a) && (o = this._getOrReturnCtx(t, o), i ? O(o, {
          code: j.too_big,
          maximum: s.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: s.message
        }) : a && O(o, {
          code: j.too_small,
          minimum: s.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: s.message
        }), r.dirty());
      } else if (s.kind === "email")
        Xx.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
          validation: "email",
          code: j.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "emoji")
        ml || (ml = new RegExp(Jx, "u")), ml.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
          validation: "emoji",
          code: j.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "uuid")
        Qx.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
          validation: "uuid",
          code: j.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "nanoid")
        Kx.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
          validation: "nanoid",
          code: j.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "cuid")
        Wx.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
          validation: "cuid",
          code: j.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "cuid2")
        Hx.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
          validation: "cuid2",
          code: j.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "ulid")
        Zx.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
          validation: "ulid",
          code: j.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "url")
        try {
          new URL(t.data);
        } catch {
          o = this._getOrReturnCtx(t, o), O(o, {
            validation: "url",
            code: j.invalid_string,
            message: s.message
          }), r.dirty();
        }
      else s.kind === "regex" ? (s.regex.lastIndex = 0, s.regex.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
        validation: "regex",
        code: j.invalid_string,
        message: s.message
      }), r.dirty())) : s.kind === "trim" ? t.data = t.data.trim() : s.kind === "includes" ? t.data.includes(s.value, s.position) || (o = this._getOrReturnCtx(t, o), O(o, {
        code: j.invalid_string,
        validation: { includes: s.value, position: s.position },
        message: s.message
      }), r.dirty()) : s.kind === "toLowerCase" ? t.data = t.data.toLowerCase() : s.kind === "toUpperCase" ? t.data = t.data.toUpperCase() : s.kind === "startsWith" ? t.data.startsWith(s.value) || (o = this._getOrReturnCtx(t, o), O(o, {
        code: j.invalid_string,
        validation: { startsWith: s.value },
        message: s.message
      }), r.dirty()) : s.kind === "endsWith" ? t.data.endsWith(s.value) || (o = this._getOrReturnCtx(t, o), O(o, {
        code: j.invalid_string,
        validation: { endsWith: s.value },
        message: s.message
      }), r.dirty()) : s.kind === "datetime" ? a1(s).test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
        code: j.invalid_string,
        validation: "datetime",
        message: s.message
      }), r.dirty()) : s.kind === "date" ? s1.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
        code: j.invalid_string,
        validation: "date",
        message: s.message
      }), r.dirty()) : s.kind === "time" ? i1(s).test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
        code: j.invalid_string,
        validation: "time",
        message: s.message
      }), r.dirty()) : s.kind === "duration" ? Gx.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
        validation: "duration",
        code: j.invalid_string,
        message: s.message
      }), r.dirty()) : s.kind === "ip" ? l1(t.data, s.version) || (o = this._getOrReturnCtx(t, o), O(o, {
        validation: "ip",
        code: j.invalid_string,
        message: s.message
      }), r.dirty()) : s.kind === "jwt" ? u1(t.data, s.alg) || (o = this._getOrReturnCtx(t, o), O(o, {
        validation: "jwt",
        code: j.invalid_string,
        message: s.message
      }), r.dirty()) : s.kind === "cidr" ? c1(t.data, s.version) || (o = this._getOrReturnCtx(t, o), O(o, {
        validation: "cidr",
        code: j.invalid_string,
        message: s.message
      }), r.dirty()) : s.kind === "base64" ? r1.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
        validation: "base64",
        code: j.invalid_string,
        message: s.message
      }), r.dirty()) : s.kind === "base64url" ? o1.test(t.data) || (o = this._getOrReturnCtx(t, o), O(o, {
        validation: "base64url",
        code: j.invalid_string,
        message: s.message
      }), r.dirty()) : oe.assertNever(s);
    return { status: r.value, value: t.data };
  }
  _regex(t, n, r) {
    return this.refinement((o) => t.test(o), {
      validation: n,
      code: j.invalid_string,
      ...L.errToObj(r)
    });
  }
  _addCheck(t) {
    return new dn({
      ...this._def,
      checks: [...this._def.checks, t]
    });
  }
  email(t) {
    return this._addCheck({ kind: "email", ...L.errToObj(t) });
  }
  url(t) {
    return this._addCheck({ kind: "url", ...L.errToObj(t) });
  }
  emoji(t) {
    return this._addCheck({ kind: "emoji", ...L.errToObj(t) });
  }
  uuid(t) {
    return this._addCheck({ kind: "uuid", ...L.errToObj(t) });
  }
  nanoid(t) {
    return this._addCheck({ kind: "nanoid", ...L.errToObj(t) });
  }
  cuid(t) {
    return this._addCheck({ kind: "cuid", ...L.errToObj(t) });
  }
  cuid2(t) {
    return this._addCheck({ kind: "cuid2", ...L.errToObj(t) });
  }
  ulid(t) {
    return this._addCheck({ kind: "ulid", ...L.errToObj(t) });
  }
  base64(t) {
    return this._addCheck({ kind: "base64", ...L.errToObj(t) });
  }
  base64url(t) {
    return this._addCheck({
      kind: "base64url",
      ...L.errToObj(t)
    });
  }
  jwt(t) {
    return this._addCheck({ kind: "jwt", ...L.errToObj(t) });
  }
  ip(t) {
    return this._addCheck({ kind: "ip", ...L.errToObj(t) });
  }
  cidr(t) {
    return this._addCheck({ kind: "cidr", ...L.errToObj(t) });
  }
  datetime(t) {
    return typeof t == "string" ? this._addCheck({
      kind: "datetime",
      precision: null,
      offset: !1,
      local: !1,
      message: t
    }) : this._addCheck({
      kind: "datetime",
      precision: typeof t?.precision > "u" ? null : t?.precision,
      offset: t?.offset ?? !1,
      local: t?.local ?? !1,
      ...L.errToObj(t?.message)
    });
  }
  date(t) {
    return this._addCheck({ kind: "date", message: t });
  }
  time(t) {
    return typeof t == "string" ? this._addCheck({
      kind: "time",
      precision: null,
      message: t
    }) : this._addCheck({
      kind: "time",
      precision: typeof t?.precision > "u" ? null : t?.precision,
      ...L.errToObj(t?.message)
    });
  }
  duration(t) {
    return this._addCheck({ kind: "duration", ...L.errToObj(t) });
  }
  regex(t, n) {
    return this._addCheck({
      kind: "regex",
      regex: t,
      ...L.errToObj(n)
    });
  }
  includes(t, n) {
    return this._addCheck({
      kind: "includes",
      value: t,
      position: n?.position,
      ...L.errToObj(n?.message)
    });
  }
  startsWith(t, n) {
    return this._addCheck({
      kind: "startsWith",
      value: t,
      ...L.errToObj(n)
    });
  }
  endsWith(t, n) {
    return this._addCheck({
      kind: "endsWith",
      value: t,
      ...L.errToObj(n)
    });
  }
  min(t, n) {
    return this._addCheck({
      kind: "min",
      value: t,
      ...L.errToObj(n)
    });
  }
  max(t, n) {
    return this._addCheck({
      kind: "max",
      value: t,
      ...L.errToObj(n)
    });
  }
  length(t, n) {
    return this._addCheck({
      kind: "length",
      value: t,
      ...L.errToObj(n)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(t) {
    return this.min(1, L.errToObj(t));
  }
  trim() {
    return new dn({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new dn({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new dn({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((t) => t.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((t) => t.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((t) => t.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((t) => t.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((t) => t.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((t) => t.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((t) => t.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((t) => t.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((t) => t.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((t) => t.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((t) => t.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((t) => t.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((t) => t.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((t) => t.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((t) => t.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((t) => t.kind === "base64url");
  }
  get minLength() {
    let t = null;
    for (const n of this._def.checks)
      n.kind === "min" && (t === null || n.value > t) && (t = n.value);
    return t;
  }
  get maxLength() {
    let t = null;
    for (const n of this._def.checks)
      n.kind === "max" && (t === null || n.value < t) && (t = n.value);
    return t;
  }
}
dn.create = (e) => new dn({
  checks: [],
  typeName: H.ZodString,
  coerce: e?.coerce ?? !1,
  ...G(e)
});
function d1(e, t) {
  const n = (e.toString().split(".")[1] || "").length, r = (t.toString().split(".")[1] || "").length, o = n > r ? n : r, s = Number.parseInt(e.toFixed(o).replace(".", "")), i = Number.parseInt(t.toFixed(o).replace(".", ""));
  return s % i / 10 ** o;
}
class so extends re {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte, this.step = this.multipleOf;
  }
  _parse(t) {
    if (this._def.coerce && (t.data = Number(t.data)), this._getType(t) !== z.number) {
      const s = this._getOrReturnCtx(t);
      return O(s, {
        code: j.invalid_type,
        expected: z.number,
        received: s.parsedType
      }), W;
    }
    let r;
    const o = new Ge();
    for (const s of this._def.checks)
      s.kind === "int" ? oe.isInteger(t.data) || (r = this._getOrReturnCtx(t, r), O(r, {
        code: j.invalid_type,
        expected: "integer",
        received: "float",
        message: s.message
      }), o.dirty()) : s.kind === "min" ? (s.inclusive ? t.data < s.value : t.data <= s.value) && (r = this._getOrReturnCtx(t, r), O(r, {
        code: j.too_small,
        minimum: s.value,
        type: "number",
        inclusive: s.inclusive,
        exact: !1,
        message: s.message
      }), o.dirty()) : s.kind === "max" ? (s.inclusive ? t.data > s.value : t.data >= s.value) && (r = this._getOrReturnCtx(t, r), O(r, {
        code: j.too_big,
        maximum: s.value,
        type: "number",
        inclusive: s.inclusive,
        exact: !1,
        message: s.message
      }), o.dirty()) : s.kind === "multipleOf" ? d1(t.data, s.value) !== 0 && (r = this._getOrReturnCtx(t, r), O(r, {
        code: j.not_multiple_of,
        multipleOf: s.value,
        message: s.message
      }), o.dirty()) : s.kind === "finite" ? Number.isFinite(t.data) || (r = this._getOrReturnCtx(t, r), O(r, {
        code: j.not_finite,
        message: s.message
      }), o.dirty()) : oe.assertNever(s);
    return { status: o.value, value: t.data };
  }
  gte(t, n) {
    return this.setLimit("min", t, !0, L.toString(n));
  }
  gt(t, n) {
    return this.setLimit("min", t, !1, L.toString(n));
  }
  lte(t, n) {
    return this.setLimit("max", t, !0, L.toString(n));
  }
  lt(t, n) {
    return this.setLimit("max", t, !1, L.toString(n));
  }
  setLimit(t, n, r, o) {
    return new so({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind: t,
          value: n,
          inclusive: r,
          message: L.toString(o)
        }
      ]
    });
  }
  _addCheck(t) {
    return new so({
      ...this._def,
      checks: [...this._def.checks, t]
    });
  }
  int(t) {
    return this._addCheck({
      kind: "int",
      message: L.toString(t)
    });
  }
  positive(t) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !1,
      message: L.toString(t)
    });
  }
  negative(t) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !1,
      message: L.toString(t)
    });
  }
  nonpositive(t) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !0,
      message: L.toString(t)
    });
  }
  nonnegative(t) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !0,
      message: L.toString(t)
    });
  }
  multipleOf(t, n) {
    return this._addCheck({
      kind: "multipleOf",
      value: t,
      message: L.toString(n)
    });
  }
  finite(t) {
    return this._addCheck({
      kind: "finite",
      message: L.toString(t)
    });
  }
  safe(t) {
    return this._addCheck({
      kind: "min",
      inclusive: !0,
      value: Number.MIN_SAFE_INTEGER,
      message: L.toString(t)
    })._addCheck({
      kind: "max",
      inclusive: !0,
      value: Number.MAX_SAFE_INTEGER,
      message: L.toString(t)
    });
  }
  get minValue() {
    let t = null;
    for (const n of this._def.checks)
      n.kind === "min" && (t === null || n.value > t) && (t = n.value);
    return t;
  }
  get maxValue() {
    let t = null;
    for (const n of this._def.checks)
      n.kind === "max" && (t === null || n.value < t) && (t = n.value);
    return t;
  }
  get isInt() {
    return !!this._def.checks.find((t) => t.kind === "int" || t.kind === "multipleOf" && oe.isInteger(t.value));
  }
  get isFinite() {
    let t = null, n = null;
    for (const r of this._def.checks) {
      if (r.kind === "finite" || r.kind === "int" || r.kind === "multipleOf")
        return !0;
      r.kind === "min" ? (n === null || r.value > n) && (n = r.value) : r.kind === "max" && (t === null || r.value < t) && (t = r.value);
    }
    return Number.isFinite(n) && Number.isFinite(t);
  }
}
so.create = (e) => new so({
  checks: [],
  typeName: H.ZodNumber,
  coerce: e?.coerce || !1,
  ...G(e)
});
class cs extends re {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte;
  }
  _parse(t) {
    if (this._def.coerce)
      try {
        t.data = BigInt(t.data);
      } catch {
        return this._getInvalidInput(t);
      }
    if (this._getType(t) !== z.bigint)
      return this._getInvalidInput(t);
    let r;
    const o = new Ge();
    for (const s of this._def.checks)
      s.kind === "min" ? (s.inclusive ? t.data < s.value : t.data <= s.value) && (r = this._getOrReturnCtx(t, r), O(r, {
        code: j.too_small,
        type: "bigint",
        minimum: s.value,
        inclusive: s.inclusive,
        message: s.message
      }), o.dirty()) : s.kind === "max" ? (s.inclusive ? t.data > s.value : t.data >= s.value) && (r = this._getOrReturnCtx(t, r), O(r, {
        code: j.too_big,
        type: "bigint",
        maximum: s.value,
        inclusive: s.inclusive,
        message: s.message
      }), o.dirty()) : s.kind === "multipleOf" ? t.data % s.value !== BigInt(0) && (r = this._getOrReturnCtx(t, r), O(r, {
        code: j.not_multiple_of,
        multipleOf: s.value,
        message: s.message
      }), o.dirty()) : oe.assertNever(s);
    return { status: o.value, value: t.data };
  }
  _getInvalidInput(t) {
    const n = this._getOrReturnCtx(t);
    return O(n, {
      code: j.invalid_type,
      expected: z.bigint,
      received: n.parsedType
    }), W;
  }
  gte(t, n) {
    return this.setLimit("min", t, !0, L.toString(n));
  }
  gt(t, n) {
    return this.setLimit("min", t, !1, L.toString(n));
  }
  lte(t, n) {
    return this.setLimit("max", t, !0, L.toString(n));
  }
  lt(t, n) {
    return this.setLimit("max", t, !1, L.toString(n));
  }
  setLimit(t, n, r, o) {
    return new cs({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind: t,
          value: n,
          inclusive: r,
          message: L.toString(o)
        }
      ]
    });
  }
  _addCheck(t) {
    return new cs({
      ...this._def,
      checks: [...this._def.checks, t]
    });
  }
  positive(t) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !1,
      message: L.toString(t)
    });
  }
  negative(t) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !1,
      message: L.toString(t)
    });
  }
  nonpositive(t) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !0,
      message: L.toString(t)
    });
  }
  nonnegative(t) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !0,
      message: L.toString(t)
    });
  }
  multipleOf(t, n) {
    return this._addCheck({
      kind: "multipleOf",
      value: t,
      message: L.toString(n)
    });
  }
  get minValue() {
    let t = null;
    for (const n of this._def.checks)
      n.kind === "min" && (t === null || n.value > t) && (t = n.value);
    return t;
  }
  get maxValue() {
    let t = null;
    for (const n of this._def.checks)
      n.kind === "max" && (t === null || n.value < t) && (t = n.value);
    return t;
  }
}
cs.create = (e) => new cs({
  checks: [],
  typeName: H.ZodBigInt,
  coerce: e?.coerce ?? !1,
  ...G(e)
});
class $u extends re {
  _parse(t) {
    if (this._def.coerce && (t.data = !!t.data), this._getType(t) !== z.boolean) {
      const r = this._getOrReturnCtx(t);
      return O(r, {
        code: j.invalid_type,
        expected: z.boolean,
        received: r.parsedType
      }), W;
    }
    return Mt(t.data);
  }
}
$u.create = (e) => new $u({
  typeName: H.ZodBoolean,
  coerce: e?.coerce || !1,
  ...G(e)
});
class Zi extends re {
  _parse(t) {
    if (this._def.coerce && (t.data = new Date(t.data)), this._getType(t) !== z.date) {
      const s = this._getOrReturnCtx(t);
      return O(s, {
        code: j.invalid_type,
        expected: z.date,
        received: s.parsedType
      }), W;
    }
    if (Number.isNaN(t.data.getTime())) {
      const s = this._getOrReturnCtx(t);
      return O(s, {
        code: j.invalid_date
      }), W;
    }
    const r = new Ge();
    let o;
    for (const s of this._def.checks)
      s.kind === "min" ? t.data.getTime() < s.value && (o = this._getOrReturnCtx(t, o), O(o, {
        code: j.too_small,
        message: s.message,
        inclusive: !0,
        exact: !1,
        minimum: s.value,
        type: "date"
      }), r.dirty()) : s.kind === "max" ? t.data.getTime() > s.value && (o = this._getOrReturnCtx(t, o), O(o, {
        code: j.too_big,
        message: s.message,
        inclusive: !0,
        exact: !1,
        maximum: s.value,
        type: "date"
      }), r.dirty()) : oe.assertNever(s);
    return {
      status: r.value,
      value: new Date(t.data.getTime())
    };
  }
  _addCheck(t) {
    return new Zi({
      ...this._def,
      checks: [...this._def.checks, t]
    });
  }
  min(t, n) {
    return this._addCheck({
      kind: "min",
      value: t.getTime(),
      message: L.toString(n)
    });
  }
  max(t, n) {
    return this._addCheck({
      kind: "max",
      value: t.getTime(),
      message: L.toString(n)
    });
  }
  get minDate() {
    let t = null;
    for (const n of this._def.checks)
      n.kind === "min" && (t === null || n.value > t) && (t = n.value);
    return t != null ? new Date(t) : null;
  }
  get maxDate() {
    let t = null;
    for (const n of this._def.checks)
      n.kind === "max" && (t === null || n.value < t) && (t = n.value);
    return t != null ? new Date(t) : null;
  }
}
Zi.create = (e) => new Zi({
  checks: [],
  coerce: e?.coerce || !1,
  typeName: H.ZodDate,
  ...G(e)
});
class Kf extends re {
  _parse(t) {
    if (this._getType(t) !== z.symbol) {
      const r = this._getOrReturnCtx(t);
      return O(r, {
        code: j.invalid_type,
        expected: z.symbol,
        received: r.parsedType
      }), W;
    }
    return Mt(t.data);
  }
}
Kf.create = (e) => new Kf({
  typeName: H.ZodSymbol,
  ...G(e)
});
class Iu extends re {
  _parse(t) {
    if (this._getType(t) !== z.undefined) {
      const r = this._getOrReturnCtx(t);
      return O(r, {
        code: j.invalid_type,
        expected: z.undefined,
        received: r.parsedType
      }), W;
    }
    return Mt(t.data);
  }
}
Iu.create = (e) => new Iu({
  typeName: H.ZodUndefined,
  ...G(e)
});
class Tu extends re {
  _parse(t) {
    if (this._getType(t) !== z.null) {
      const r = this._getOrReturnCtx(t);
      return O(r, {
        code: j.invalid_type,
        expected: z.null,
        received: r.parsedType
      }), W;
    }
    return Mt(t.data);
  }
}
Tu.create = (e) => new Tu({
  typeName: H.ZodNull,
  ...G(e)
});
class Yf extends re {
  constructor() {
    super(...arguments), this._any = !0;
  }
  _parse(t) {
    return Mt(t.data);
  }
}
Yf.create = (e) => new Yf({
  typeName: H.ZodAny,
  ...G(e)
});
class Gf extends re {
  constructor() {
    super(...arguments), this._unknown = !0;
  }
  _parse(t) {
    return Mt(t.data);
  }
}
Gf.create = (e) => new Gf({
  typeName: H.ZodUnknown,
  ...G(e)
});
class Qn extends re {
  _parse(t) {
    const n = this._getOrReturnCtx(t);
    return O(n, {
      code: j.invalid_type,
      expected: z.never,
      received: n.parsedType
    }), W;
  }
}
Qn.create = (e) => new Qn({
  typeName: H.ZodNever,
  ...G(e)
});
class Xf extends re {
  _parse(t) {
    if (this._getType(t) !== z.undefined) {
      const r = this._getOrReturnCtx(t);
      return O(r, {
        code: j.invalid_type,
        expected: z.void,
        received: r.parsedType
      }), W;
    }
    return Mt(t.data);
  }
}
Xf.create = (e) => new Xf({
  typeName: H.ZodVoid,
  ...G(e)
});
class nn extends re {
  _parse(t) {
    const { ctx: n, status: r } = this._processInputParams(t), o = this._def;
    if (n.parsedType !== z.array)
      return O(n, {
        code: j.invalid_type,
        expected: z.array,
        received: n.parsedType
      }), W;
    if (o.exactLength !== null) {
      const i = n.data.length > o.exactLength.value, a = n.data.length < o.exactLength.value;
      (i || a) && (O(n, {
        code: i ? j.too_big : j.too_small,
        minimum: a ? o.exactLength.value : void 0,
        maximum: i ? o.exactLength.value : void 0,
        type: "array",
        inclusive: !0,
        exact: !0,
        message: o.exactLength.message
      }), r.dirty());
    }
    if (o.minLength !== null && n.data.length < o.minLength.value && (O(n, {
      code: j.too_small,
      minimum: o.minLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: o.minLength.message
    }), r.dirty()), o.maxLength !== null && n.data.length > o.maxLength.value && (O(n, {
      code: j.too_big,
      maximum: o.maxLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: o.maxLength.message
    }), r.dirty()), n.common.async)
      return Promise.all([...n.data].map((i, a) => o.type._parseAsync(new rn(n, i, n.path, a)))).then((i) => Ge.mergeArray(r, i));
    const s = [...n.data].map((i, a) => o.type._parseSync(new rn(n, i, n.path, a)));
    return Ge.mergeArray(r, s);
  }
  get element() {
    return this._def.type;
  }
  min(t, n) {
    return new nn({
      ...this._def,
      minLength: { value: t, message: L.toString(n) }
    });
  }
  max(t, n) {
    return new nn({
      ...this._def,
      maxLength: { value: t, message: L.toString(n) }
    });
  }
  length(t, n) {
    return new nn({
      ...this._def,
      exactLength: { value: t, message: L.toString(n) }
    });
  }
  nonempty(t) {
    return this.min(1, t);
  }
}
nn.create = (e, t) => new nn({
  type: e,
  minLength: null,
  maxLength: null,
  exactLength: null,
  typeName: H.ZodArray,
  ...G(t)
});
function Nr(e) {
  if (e instanceof je) {
    const t = {};
    for (const n in e.shape) {
      const r = e.shape[n];
      t[n] = pn.create(Nr(r));
    }
    return new je({
      ...e._def,
      shape: () => t
    });
  } else return e instanceof nn ? new nn({
    ...e._def,
    type: Nr(e.element)
  }) : e instanceof pn ? pn.create(Nr(e.unwrap())) : e instanceof Sr ? Sr.create(Nr(e.unwrap())) : e instanceof xr ? xr.create(e.items.map((t) => Nr(t))) : e;
}
class je extends re {
  constructor() {
    super(...arguments), this._cached = null, this.nonstrict = this.passthrough, this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const t = this._def.shape(), n = oe.objectKeys(t);
    return this._cached = { shape: t, keys: n }, this._cached;
  }
  _parse(t) {
    if (this._getType(t) !== z.object) {
      const u = this._getOrReturnCtx(t);
      return O(u, {
        code: j.invalid_type,
        expected: z.object,
        received: u.parsedType
      }), W;
    }
    const { status: r, ctx: o } = this._processInputParams(t), { shape: s, keys: i } = this._getCached(), a = [];
    if (!(this._def.catchall instanceof Qn && this._def.unknownKeys === "strip"))
      for (const u in o.data)
        i.includes(u) || a.push(u);
    const l = [];
    for (const u of i) {
      const c = s[u], p = o.data[u];
      l.push({
        key: { status: "valid", value: u },
        value: c._parse(new rn(o, p, o.path, u)),
        alwaysSet: u in o.data
      });
    }
    if (this._def.catchall instanceof Qn) {
      const u = this._def.unknownKeys;
      if (u === "passthrough")
        for (const c of a)
          l.push({
            key: { status: "valid", value: c },
            value: { status: "valid", value: o.data[c] }
          });
      else if (u === "strict")
        a.length > 0 && (O(o, {
          code: j.unrecognized_keys,
          keys: a
        }), r.dirty());
      else if (u !== "strip") throw new Error("Internal ZodObject error: invalid unknownKeys value.");
    } else {
      const u = this._def.catchall;
      for (const c of a) {
        const p = o.data[c];
        l.push({
          key: { status: "valid", value: c },
          value: u._parse(
            new rn(o, p, o.path, c)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: c in o.data
        });
      }
    }
    return o.common.async ? Promise.resolve().then(async () => {
      const u = [];
      for (const c of l) {
        const p = await c.key, g = await c.value;
        u.push({
          key: p,
          value: g,
          alwaysSet: c.alwaysSet
        });
      }
      return u;
    }).then((u) => Ge.mergeObjectSync(r, u)) : Ge.mergeObjectSync(r, l);
  }
  get shape() {
    return this._def.shape();
  }
  strict(t) {
    return L.errToObj, new je({
      ...this._def,
      unknownKeys: "strict",
      ...t !== void 0 ? {
        errorMap: (n, r) => {
          const o = this._def.errorMap?.(n, r).message ?? r.defaultError;
          return n.code === "unrecognized_keys" ? {
            message: L.errToObj(t).message ?? o
          } : {
            message: o
          };
        }
      } : {}
    });
  }
  strip() {
    return new je({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new je({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(t) {
    return new je({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...t
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(t) {
    return new je({
      unknownKeys: t._def.unknownKeys,
      catchall: t._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...t._def.shape()
      }),
      typeName: H.ZodObject
    });
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(t, n) {
    return this.augment({ [t]: n });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(t) {
    return new je({
      ...this._def,
      catchall: t
    });
  }
  pick(t) {
    const n = {};
    for (const r of oe.objectKeys(t))
      t[r] && this.shape[r] && (n[r] = this.shape[r]);
    return new je({
      ...this._def,
      shape: () => n
    });
  }
  omit(t) {
    const n = {};
    for (const r of oe.objectKeys(this.shape))
      t[r] || (n[r] = this.shape[r]);
    return new je({
      ...this._def,
      shape: () => n
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return Nr(this);
  }
  partial(t) {
    const n = {};
    for (const r of oe.objectKeys(this.shape)) {
      const o = this.shape[r];
      t && !t[r] ? n[r] = o : n[r] = o.optional();
    }
    return new je({
      ...this._def,
      shape: () => n
    });
  }
  required(t) {
    const n = {};
    for (const r of oe.objectKeys(this.shape))
      if (t && !t[r])
        n[r] = this.shape[r];
      else {
        let s = this.shape[r];
        for (; s instanceof pn; )
          s = s._def.innerType;
        n[r] = s;
      }
    return new je({
      ...this._def,
      shape: () => n
    });
  }
  keyof() {
    return Ey(oe.objectKeys(this.shape));
  }
}
je.create = (e, t) => new je({
  shape: () => e,
  unknownKeys: "strip",
  catchall: Qn.create(),
  typeName: H.ZodObject,
  ...G(t)
});
je.strictCreate = (e, t) => new je({
  shape: () => e,
  unknownKeys: "strict",
  catchall: Qn.create(),
  typeName: H.ZodObject,
  ...G(t)
});
je.lazycreate = (e, t) => new je({
  shape: e,
  unknownKeys: "strip",
  catchall: Qn.create(),
  typeName: H.ZodObject,
  ...G(t)
});
class Qi extends re {
  _parse(t) {
    const { ctx: n } = this._processInputParams(t), r = this._def.options;
    function o(s) {
      for (const a of s)
        if (a.result.status === "valid")
          return a.result;
      for (const a of s)
        if (a.result.status === "dirty")
          return n.common.issues.push(...a.ctx.common.issues), a.result;
      const i = s.map((a) => new vn(a.ctx.common.issues));
      return O(n, {
        code: j.invalid_union,
        unionErrors: i
      }), W;
    }
    if (n.common.async)
      return Promise.all(r.map(async (s) => {
        const i = {
          ...n,
          common: {
            ...n.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await s._parseAsync({
            data: n.data,
            path: n.path,
            parent: i
          }),
          ctx: i
        };
      })).then(o);
    {
      let s;
      const i = [];
      for (const l of r) {
        const u = {
          ...n,
          common: {
            ...n.common,
            issues: []
          },
          parent: null
        }, c = l._parseSync({
          data: n.data,
          path: n.path,
          parent: u
        });
        if (c.status === "valid")
          return c;
        c.status === "dirty" && !s && (s = { result: c, ctx: u }), u.common.issues.length && i.push(u.common.issues);
      }
      if (s)
        return n.common.issues.push(...s.ctx.common.issues), s.result;
      const a = i.map((l) => new vn(l));
      return O(n, {
        code: j.invalid_union,
        unionErrors: a
      }), W;
    }
  }
  get options() {
    return this._def.options;
  }
}
Qi.create = (e, t) => new Qi({
  options: e,
  typeName: H.ZodUnion,
  ...G(t)
});
const sn = (e) => e instanceof Ou ? sn(e.schema) : e instanceof kr ? sn(e.innerType()) : e instanceof Gi ? [e.value] : e instanceof wr ? e.options : e instanceof Pu ? oe.objectValues(e.enum) : e instanceof Ji ? sn(e._def.innerType) : e instanceof Iu ? [void 0] : e instanceof Tu ? [null] : e instanceof pn ? [void 0, ...sn(e.unwrap())] : e instanceof Sr ? [null, ...sn(e.unwrap())] : e instanceof jy || e instanceof ea ? sn(e.unwrap()) : e instanceof qi ? sn(e._def.innerType) : [];
class Zc extends re {
  _parse(t) {
    const { ctx: n } = this._processInputParams(t);
    if (n.parsedType !== z.object)
      return O(n, {
        code: j.invalid_type,
        expected: z.object,
        received: n.parsedType
      }), W;
    const r = this.discriminator, o = n.data[r], s = this.optionsMap.get(o);
    return s ? n.common.async ? s._parseAsync({
      data: n.data,
      path: n.path,
      parent: n
    }) : s._parseSync({
      data: n.data,
      path: n.path,
      parent: n
    }) : (O(n, {
      code: j.invalid_union_discriminator,
      options: Array.from(this.optionsMap.keys()),
      path: [r]
    }), W);
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(t, n, r) {
    const o = /* @__PURE__ */ new Map();
    for (const s of n) {
      const i = sn(s.shape[t]);
      if (!i.length)
        throw new Error(`A discriminator value for key \`${t}\` could not be extracted from all schema options`);
      for (const a of i) {
        if (o.has(a))
          throw new Error(`Discriminator property ${String(t)} has duplicate value ${String(a)}`);
        o.set(a, s);
      }
    }
    return new Zc({
      typeName: H.ZodDiscriminatedUnion,
      discriminator: t,
      options: n,
      optionsMap: o,
      ...G(r)
    });
  }
}
function Nu(e, t) {
  const n = In(e), r = In(t);
  if (e === t)
    return { valid: !0, data: e };
  if (n === z.object && r === z.object) {
    const o = oe.objectKeys(t), s = oe.objectKeys(e).filter((a) => o.indexOf(a) !== -1), i = { ...e, ...t };
    for (const a of s) {
      const l = Nu(e[a], t[a]);
      if (!l.valid)
        return { valid: !1 };
      i[a] = l.data;
    }
    return { valid: !0, data: i };
  } else if (n === z.array && r === z.array) {
    if (e.length !== t.length)
      return { valid: !1 };
    const o = [];
    for (let s = 0; s < e.length; s++) {
      const i = e[s], a = t[s], l = Nu(i, a);
      if (!l.valid)
        return { valid: !1 };
      o.push(l.data);
    }
    return { valid: !0, data: o };
  } else return n === z.date && r === z.date && +e == +t ? { valid: !0, data: e } : { valid: !1 };
}
class Ki extends re {
  _parse(t) {
    const { status: n, ctx: r } = this._processInputParams(t), o = (s, i) => {
      if (Hf(s) || Hf(i))
        return W;
      const a = Nu(s.value, i.value);
      return a.valid ? ((Zf(s) || Zf(i)) && n.dirty(), { status: n.value, value: a.data }) : (O(r, {
        code: j.invalid_intersection_types
      }), W);
    };
    return r.common.async ? Promise.all([
      this._def.left._parseAsync({
        data: r.data,
        path: r.path,
        parent: r
      }),
      this._def.right._parseAsync({
        data: r.data,
        path: r.path,
        parent: r
      })
    ]).then(([s, i]) => o(s, i)) : o(this._def.left._parseSync({
      data: r.data,
      path: r.path,
      parent: r
    }), this._def.right._parseSync({
      data: r.data,
      path: r.path,
      parent: r
    }));
  }
}
Ki.create = (e, t, n) => new Ki({
  left: e,
  right: t,
  typeName: H.ZodIntersection,
  ...G(n)
});
class xr extends re {
  _parse(t) {
    const { status: n, ctx: r } = this._processInputParams(t);
    if (r.parsedType !== z.array)
      return O(r, {
        code: j.invalid_type,
        expected: z.array,
        received: r.parsedType
      }), W;
    if (r.data.length < this._def.items.length)
      return O(r, {
        code: j.too_small,
        minimum: this._def.items.length,
        inclusive: !0,
        exact: !1,
        type: "array"
      }), W;
    !this._def.rest && r.data.length > this._def.items.length && (O(r, {
      code: j.too_big,
      maximum: this._def.items.length,
      inclusive: !0,
      exact: !1,
      type: "array"
    }), n.dirty());
    const s = [...r.data].map((i, a) => {
      const l = this._def.items[a] || this._def.rest;
      return l ? l._parse(new rn(r, i, r.path, a)) : null;
    }).filter((i) => !!i);
    return r.common.async ? Promise.all(s).then((i) => Ge.mergeArray(n, i)) : Ge.mergeArray(n, s);
  }
  get items() {
    return this._def.items;
  }
  rest(t) {
    return new xr({
      ...this._def,
      rest: t
    });
  }
}
xr.create = (e, t) => {
  if (!Array.isArray(e))
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  return new xr({
    items: e,
    typeName: H.ZodTuple,
    rest: null,
    ...G(t)
  });
};
class Yi extends re {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(t) {
    const { status: n, ctx: r } = this._processInputParams(t);
    if (r.parsedType !== z.object)
      return O(r, {
        code: j.invalid_type,
        expected: z.object,
        received: r.parsedType
      }), W;
    const o = [], s = this._def.keyType, i = this._def.valueType;
    for (const a in r.data)
      o.push({
        key: s._parse(new rn(r, a, r.path, a)),
        value: i._parse(new rn(r, r.data[a], r.path, a)),
        alwaysSet: a in r.data
      });
    return r.common.async ? Ge.mergeObjectAsync(n, o) : Ge.mergeObjectSync(n, o);
  }
  get element() {
    return this._def.valueType;
  }
  static create(t, n, r) {
    return n instanceof re ? new Yi({
      keyType: t,
      valueType: n,
      typeName: H.ZodRecord,
      ...G(r)
    }) : new Yi({
      keyType: dn.create(),
      valueType: t,
      typeName: H.ZodRecord,
      ...G(n)
    });
  }
}
class Jf extends re {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(t) {
    const { status: n, ctx: r } = this._processInputParams(t);
    if (r.parsedType !== z.map)
      return O(r, {
        code: j.invalid_type,
        expected: z.map,
        received: r.parsedType
      }), W;
    const o = this._def.keyType, s = this._def.valueType, i = [...r.data.entries()].map(([a, l], u) => ({
      key: o._parse(new rn(r, a, r.path, [u, "key"])),
      value: s._parse(new rn(r, l, r.path, [u, "value"]))
    }));
    if (r.common.async) {
      const a = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const l of i) {
          const u = await l.key, c = await l.value;
          if (u.status === "aborted" || c.status === "aborted")
            return W;
          (u.status === "dirty" || c.status === "dirty") && n.dirty(), a.set(u.value, c.value);
        }
        return { status: n.value, value: a };
      });
    } else {
      const a = /* @__PURE__ */ new Map();
      for (const l of i) {
        const u = l.key, c = l.value;
        if (u.status === "aborted" || c.status === "aborted")
          return W;
        (u.status === "dirty" || c.status === "dirty") && n.dirty(), a.set(u.value, c.value);
      }
      return { status: n.value, value: a };
    }
  }
}
Jf.create = (e, t, n) => new Jf({
  valueType: t,
  keyType: e,
  typeName: H.ZodMap,
  ...G(n)
});
class ds extends re {
  _parse(t) {
    const { status: n, ctx: r } = this._processInputParams(t);
    if (r.parsedType !== z.set)
      return O(r, {
        code: j.invalid_type,
        expected: z.set,
        received: r.parsedType
      }), W;
    const o = this._def;
    o.minSize !== null && r.data.size < o.minSize.value && (O(r, {
      code: j.too_small,
      minimum: o.minSize.value,
      type: "set",
      inclusive: !0,
      exact: !1,
      message: o.minSize.message
    }), n.dirty()), o.maxSize !== null && r.data.size > o.maxSize.value && (O(r, {
      code: j.too_big,
      maximum: o.maxSize.value,
      type: "set",
      inclusive: !0,
      exact: !1,
      message: o.maxSize.message
    }), n.dirty());
    const s = this._def.valueType;
    function i(l) {
      const u = /* @__PURE__ */ new Set();
      for (const c of l) {
        if (c.status === "aborted")
          return W;
        c.status === "dirty" && n.dirty(), u.add(c.value);
      }
      return { status: n.value, value: u };
    }
    const a = [...r.data.values()].map((l, u) => s._parse(new rn(r, l, r.path, u)));
    return r.common.async ? Promise.all(a).then((l) => i(l)) : i(a);
  }
  min(t, n) {
    return new ds({
      ...this._def,
      minSize: { value: t, message: L.toString(n) }
    });
  }
  max(t, n) {
    return new ds({
      ...this._def,
      maxSize: { value: t, message: L.toString(n) }
    });
  }
  size(t, n) {
    return this.min(t, n).max(t, n);
  }
  nonempty(t) {
    return this.min(1, t);
  }
}
ds.create = (e, t) => new ds({
  valueType: e,
  minSize: null,
  maxSize: null,
  typeName: H.ZodSet,
  ...G(t)
});
class Ou extends re {
  get schema() {
    return this._def.getter();
  }
  _parse(t) {
    const { ctx: n } = this._processInputParams(t);
    return this._def.getter()._parse({ data: n.data, path: n.path, parent: n });
  }
}
Ou.create = (e, t) => new Ou({
  getter: e,
  typeName: H.ZodLazy,
  ...G(t)
});
class Gi extends re {
  _parse(t) {
    if (t.data !== this._def.value) {
      const n = this._getOrReturnCtx(t);
      return O(n, {
        received: n.data,
        code: j.invalid_literal,
        expected: this._def.value
      }), W;
    }
    return { status: "valid", value: t.data };
  }
  get value() {
    return this._def.value;
  }
}
Gi.create = (e, t) => new Gi({
  value: e,
  typeName: H.ZodLiteral,
  ...G(t)
});
function Ey(e, t) {
  return new wr({
    values: e,
    typeName: H.ZodEnum,
    ...G(t)
  });
}
class wr extends re {
  _parse(t) {
    if (typeof t.data != "string") {
      const n = this._getOrReturnCtx(t), r = this._def.values;
      return O(n, {
        expected: oe.joinValues(r),
        received: n.parsedType,
        code: j.invalid_type
      }), W;
    }
    if (this._cache || (this._cache = new Set(this._def.values)), !this._cache.has(t.data)) {
      const n = this._getOrReturnCtx(t), r = this._def.values;
      return O(n, {
        received: n.data,
        code: j.invalid_enum_value,
        options: r
      }), W;
    }
    return Mt(t.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const t = {};
    for (const n of this._def.values)
      t[n] = n;
    return t;
  }
  get Values() {
    const t = {};
    for (const n of this._def.values)
      t[n] = n;
    return t;
  }
  get Enum() {
    const t = {};
    for (const n of this._def.values)
      t[n] = n;
    return t;
  }
  extract(t, n = this._def) {
    return wr.create(t, {
      ...this._def,
      ...n
    });
  }
  exclude(t, n = this._def) {
    return wr.create(this.options.filter((r) => !t.includes(r)), {
      ...this._def,
      ...n
    });
  }
}
wr.create = Ey;
class Pu extends re {
  _parse(t) {
    const n = oe.getValidEnumValues(this._def.values), r = this._getOrReturnCtx(t);
    if (r.parsedType !== z.string && r.parsedType !== z.number) {
      const o = oe.objectValues(n);
      return O(r, {
        expected: oe.joinValues(o),
        received: r.parsedType,
        code: j.invalid_type
      }), W;
    }
    if (this._cache || (this._cache = new Set(oe.getValidEnumValues(this._def.values))), !this._cache.has(t.data)) {
      const o = oe.objectValues(n);
      return O(r, {
        received: r.data,
        code: j.invalid_enum_value,
        options: o
      }), W;
    }
    return Mt(t.data);
  }
  get enum() {
    return this._def.values;
  }
}
Pu.create = (e, t) => new Pu({
  values: e,
  typeName: H.ZodNativeEnum,
  ...G(t)
});
class Xi extends re {
  unwrap() {
    return this._def.type;
  }
  _parse(t) {
    const { ctx: n } = this._processInputParams(t);
    if (n.parsedType !== z.promise && n.common.async === !1)
      return O(n, {
        code: j.invalid_type,
        expected: z.promise,
        received: n.parsedType
      }), W;
    const r = n.parsedType === z.promise ? n.data : Promise.resolve(n.data);
    return Mt(r.then((o) => this._def.type.parseAsync(o, {
      path: n.path,
      errorMap: n.common.contextualErrorMap
    })));
  }
}
Xi.create = (e, t) => new Xi({
  type: e,
  typeName: H.ZodPromise,
  ...G(t)
});
class kr extends re {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === H.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(t) {
    const { status: n, ctx: r } = this._processInputParams(t), o = this._def.effect || null, s = {
      addIssue: (i) => {
        O(r, i), i.fatal ? n.abort() : n.dirty();
      },
      get path() {
        return r.path;
      }
    };
    if (s.addIssue = s.addIssue.bind(s), o.type === "preprocess") {
      const i = o.transform(r.data, s);
      if (r.common.async)
        return Promise.resolve(i).then(async (a) => {
          if (n.value === "aborted")
            return W;
          const l = await this._def.schema._parseAsync({
            data: a,
            path: r.path,
            parent: r
          });
          return l.status === "aborted" ? W : l.status === "dirty" || n.value === "dirty" ? Io(l.value) : l;
        });
      {
        if (n.value === "aborted")
          return W;
        const a = this._def.schema._parseSync({
          data: i,
          path: r.path,
          parent: r
        });
        return a.status === "aborted" ? W : a.status === "dirty" || n.value === "dirty" ? Io(a.value) : a;
      }
    }
    if (o.type === "refinement") {
      const i = (a) => {
        const l = o.refinement(a, s);
        if (r.common.async)
          return Promise.resolve(l);
        if (l instanceof Promise)
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        return a;
      };
      if (r.common.async === !1) {
        const a = this._def.schema._parseSync({
          data: r.data,
          path: r.path,
          parent: r
        });
        return a.status === "aborted" ? W : (a.status === "dirty" && n.dirty(), i(a.value), { status: n.value, value: a.value });
      } else
        return this._def.schema._parseAsync({ data: r.data, path: r.path, parent: r }).then((a) => a.status === "aborted" ? W : (a.status === "dirty" && n.dirty(), i(a.value).then(() => ({ status: n.value, value: a.value }))));
    }
    if (o.type === "transform")
      if (r.common.async === !1) {
        const i = this._def.schema._parseSync({
          data: r.data,
          path: r.path,
          parent: r
        });
        if (!oo(i))
          return W;
        const a = o.transform(i.value, s);
        if (a instanceof Promise)
          throw new Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");
        return { status: n.value, value: a };
      } else
        return this._def.schema._parseAsync({ data: r.data, path: r.path, parent: r }).then((i) => oo(i) ? Promise.resolve(o.transform(i.value, s)).then((a) => ({
          status: n.value,
          value: a
        })) : W);
    oe.assertNever(o);
  }
}
kr.create = (e, t, n) => new kr({
  schema: e,
  typeName: H.ZodEffects,
  effect: t,
  ...G(n)
});
kr.createWithPreprocess = (e, t, n) => new kr({
  schema: t,
  effect: { type: "preprocess", transform: e },
  typeName: H.ZodEffects,
  ...G(n)
});
class pn extends re {
  _parse(t) {
    return this._getType(t) === z.undefined ? Mt(void 0) : this._def.innerType._parse(t);
  }
  unwrap() {
    return this._def.innerType;
  }
}
pn.create = (e, t) => new pn({
  innerType: e,
  typeName: H.ZodOptional,
  ...G(t)
});
class Sr extends re {
  _parse(t) {
    return this._getType(t) === z.null ? Mt(null) : this._def.innerType._parse(t);
  }
  unwrap() {
    return this._def.innerType;
  }
}
Sr.create = (e, t) => new Sr({
  innerType: e,
  typeName: H.ZodNullable,
  ...G(t)
});
class Ji extends re {
  _parse(t) {
    const { ctx: n } = this._processInputParams(t);
    let r = n.data;
    return n.parsedType === z.undefined && (r = this._def.defaultValue()), this._def.innerType._parse({
      data: r,
      path: n.path,
      parent: n
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
}
Ji.create = (e, t) => new Ji({
  innerType: e,
  typeName: H.ZodDefault,
  defaultValue: typeof t.default == "function" ? t.default : () => t.default,
  ...G(t)
});
class qi extends re {
  _parse(t) {
    const { ctx: n } = this._processInputParams(t), r = {
      ...n,
      common: {
        ...n.common,
        issues: []
      }
    }, o = this._def.innerType._parse({
      data: r.data,
      path: r.path,
      parent: {
        ...r
      }
    });
    return Hi(o) ? o.then((s) => ({
      status: "valid",
      value: s.status === "valid" ? s.value : this._def.catchValue({
        get error() {
          return new vn(r.common.issues);
        },
        input: r.data
      })
    })) : {
      status: "valid",
      value: o.status === "valid" ? o.value : this._def.catchValue({
        get error() {
          return new vn(r.common.issues);
        },
        input: r.data
      })
    };
  }
  removeCatch() {
    return this._def.innerType;
  }
}
qi.create = (e, t) => new qi({
  innerType: e,
  typeName: H.ZodCatch,
  catchValue: typeof t.catch == "function" ? t.catch : () => t.catch,
  ...G(t)
});
class qf extends re {
  _parse(t) {
    if (this._getType(t) !== z.nan) {
      const r = this._getOrReturnCtx(t);
      return O(r, {
        code: j.invalid_type,
        expected: z.nan,
        received: r.parsedType
      }), W;
    }
    return { status: "valid", value: t.data };
  }
}
qf.create = (e) => new qf({
  typeName: H.ZodNaN,
  ...G(e)
});
class jy extends re {
  _parse(t) {
    const { ctx: n } = this._processInputParams(t), r = n.data;
    return this._def.type._parse({
      data: r,
      path: n.path,
      parent: n
    });
  }
  unwrap() {
    return this._def.type;
  }
}
class Qc extends re {
  _parse(t) {
    const { status: n, ctx: r } = this._processInputParams(t);
    if (r.common.async)
      return (async () => {
        const s = await this._def.in._parseAsync({
          data: r.data,
          path: r.path,
          parent: r
        });
        return s.status === "aborted" ? W : s.status === "dirty" ? (n.dirty(), Io(s.value)) : this._def.out._parseAsync({
          data: s.value,
          path: r.path,
          parent: r
        });
      })();
    {
      const o = this._def.in._parseSync({
        data: r.data,
        path: r.path,
        parent: r
      });
      return o.status === "aborted" ? W : o.status === "dirty" ? (n.dirty(), {
        status: "dirty",
        value: o.value
      }) : this._def.out._parseSync({
        data: o.value,
        path: r.path,
        parent: r
      });
    }
  }
  static create(t, n) {
    return new Qc({
      in: t,
      out: n,
      typeName: H.ZodPipeline
    });
  }
}
class ea extends re {
  _parse(t) {
    const n = this._def.innerType._parse(t), r = (o) => (oo(o) && (o.value = Object.freeze(o.value)), o);
    return Hi(n) ? n.then((o) => r(o)) : r(n);
  }
  unwrap() {
    return this._def.innerType;
  }
}
ea.create = (e, t) => new ea({
  innerType: e,
  typeName: H.ZodReadonly,
  ...G(t)
});
var H;
(function(e) {
  e.ZodString = "ZodString", e.ZodNumber = "ZodNumber", e.ZodNaN = "ZodNaN", e.ZodBigInt = "ZodBigInt", e.ZodBoolean = "ZodBoolean", e.ZodDate = "ZodDate", e.ZodSymbol = "ZodSymbol", e.ZodUndefined = "ZodUndefined", e.ZodNull = "ZodNull", e.ZodAny = "ZodAny", e.ZodUnknown = "ZodUnknown", e.ZodNever = "ZodNever", e.ZodVoid = "ZodVoid", e.ZodArray = "ZodArray", e.ZodObject = "ZodObject", e.ZodUnion = "ZodUnion", e.ZodDiscriminatedUnion = "ZodDiscriminatedUnion", e.ZodIntersection = "ZodIntersection", e.ZodTuple = "ZodTuple", e.ZodRecord = "ZodRecord", e.ZodMap = "ZodMap", e.ZodSet = "ZodSet", e.ZodFunction = "ZodFunction", e.ZodLazy = "ZodLazy", e.ZodLiteral = "ZodLiteral", e.ZodEnum = "ZodEnum", e.ZodEffects = "ZodEffects", e.ZodNativeEnum = "ZodNativeEnum", e.ZodOptional = "ZodOptional", e.ZodNullable = "ZodNullable", e.ZodDefault = "ZodDefault", e.ZodCatch = "ZodCatch", e.ZodPromise = "ZodPromise", e.ZodBranded = "ZodBranded", e.ZodPipeline = "ZodPipeline", e.ZodReadonly = "ZodReadonly";
})(H || (H = {}));
const Ve = dn.create, it = so.create, Mu = $u.create;
Qn.create;
const pr = nn.create, kt = je.create;
Qi.create;
const f1 = Zc.create;
Ki.create;
xr.create;
const p1 = Yi.create, ui = Gi.create, Xn = wr.create;
Xi.create;
pn.create;
Sr.create;
const Uo = 2, Qe = Ve().min(1), ep = kt({ x: it(), y: it() }), ci = Xn([
  "teamA",
  "teamB",
  "neutral1",
  "neutral2",
  "neutral3",
  "ball"
]), h1 = Xn(["union", "league", "grid"]), m1 = Xn(["full", "half", "twentyTwo", "grid"]), y1 = Xn(["portrait", "landscape"]), g1 = kt({
  x: it(),
  y: it(),
  width: it().positive(),
  height: it().positive()
}), v1 = kt({
  code: h1,
  preset: m1,
  orientation: y1,
  /** Playing-area dimensions in metres (excluding in-goals). */
  lengthM: it().positive(),
  widthM: it().positive(),
  inGoalM: it().nonnegative(),
  viewport: g1
}), x1 = Xn(["private", "group", "team", "clubTemplate"]), w1 = Xn(["tactic", "drill"]), k1 = kt({
  type: Xn(["session", "match"]),
  id: Qe
}), S1 = kt({
  name: Ve().min(1),
  description: Ve().default(""),
  kind: w1,
  category: pr(Ve()).default([]),
  tags: pr(Ve()).default([]),
  isTemplate: Mu().default(!1),
  /** Built-in template this board was created from (informational). */
  templateId: Ve().optional(),
  favourite: Mu().default(!1),
  scope: x1.default("private"),
  // Host context — data only; no logic here reads these. See
  // TACTICS_BOARD_INTEGRATION_CONTRACT.md. The host's tenant IS its club, so
  // there is one id for both; groupId is the operating unit, teamId a squad.
  clubId: Qe.optional(),
  groupId: Qe.optional(),
  teamId: Qe.optional(),
  ownerUserId: Qe.optional(),
  attachments: pr(k1).default([]),
  duplicatedFromId: Qe.optional(),
  createdAt: Ve().datetime(),
  updatedAt: Ve().datetime()
}), b1 = f1("type", [
  kt({
    id: Qe,
    type: ui("player"),
    colour: ci,
    number: Ve().max(2).default(""),
    label: Ve().max(24).default(""),
    /**
     * Opaque host person key (e.g. Coach's Eye `playerMatchKey`: "id:<userId>").
     * NEVER parsed or split here — the host owns its shape and may change it.
     * A board stays fully usable when the key resolves to nobody.
     */
    hostPlayerKey: Ve().min(1).max(128).optional()
  }),
  kt({ id: Qe, type: ui("ball"), colour: ci.default("ball") }),
  kt({ id: Qe, type: ui("cone"), colour: ci.default("neutral1") })
]), _1 = Xn(["run", "pass", "kick", "arrow", "defence", "zone", "sketch", "text"]), C1 = kt({
  id: Qe,
  type: _1,
  points: pr(ep).min(1),
  control: ep.optional(),
  arcHeight: it().min(0).max(1).optional(),
  fromObjectId: Qe.optional(),
  toObjectId: Qe.optional(),
  colour: ci.default("neutral2"),
  text: Ve().optional()
}), E1 = kt({
  x: it(),
  y: it(),
  /** True when a coach explicitly placed the object in this step. */
  pinned: Mu().default(!1)
}), $y = 1500, j1 = kt({
  id: Qe,
  /** Length of the transition from this step to the next (ms). Ignored on the last step. */
  durationMs: it().int().positive().default($y),
  /** Short label shown in the step strip (optional). */
  label: Ve().max(24).default(""),
  /** Coaching note shown while presenting this step. */
  note: Ve().default(""),
  poses: p1(Qe, E1),
  drawings: pr(C1).default([])
}), $1 = kt({
  teamA: Ve().default("#1d4ed8"),
  teamB: Ve().default("#dc2626")
}), I1 = kt({
  schemaVersion: ui(Uo),
  id: Qe,
  revision: it().int().nonnegative().default(0),
  metadata: S1,
  pitch: v1,
  teamColours: $1.default({}),
  objects: pr(b1),
  steps: pr(j1).min(1)
}), tp = { lengthM: 100, widthM: 70, inGoalM: 10 };
function Iy(e) {
  return e.lengthM + 2 * e.inGoalM;
}
function T1(e) {
  return { x: 0, y: 0, width: e.widthM, height: Iy(e) };
}
function N1(e) {
  const t = Iy(e);
  return { x: 0, y: t / 2, width: e.widthM, height: t / 2 };
}
function O1(e) {
  return { x: 0, y: 0, width: e.widthM, height: e.inGoalM + 32 };
}
function Kc(e, t) {
  switch (t) {
    case "half":
      return N1(e);
    case "twentyTwo":
      return O1(e);
    case "grid":
      return { x: 0, y: 0, width: 40, height: 30 };
    case "full":
    default:
      return T1(e);
  }
}
function Vt(e, t) {
  const { viewport: n } = t, r = e.x - n.x, o = e.y - n.y;
  return t.orientation === "landscape" ? { x: n.height - o, y: r } : { x: r, y: o };
}
function P1(e, t) {
  const { viewport: n } = t;
  return t.orientation === "landscape" ? { x: e.y + n.x, y: n.height - e.x + n.y } : { x: e.x + n.x, y: e.y + n.y };
}
function ja(e) {
  const { viewport: t } = e;
  return e.orientation === "landscape" ? { width: t.height, height: t.width } : { width: t.width, height: t.height };
}
function jt(e, t = 2) {
  const n = 10 ** t;
  return { x: Math.round(e.x * n) / n, y: Math.round(e.y * n) / n };
}
const M1 = 1;
function _o(e, t, n = M1) {
  return {
    x: Math.min(Math.max(e.x, t.x - n), t.x + t.width + n),
    y: Math.min(Math.max(e.y, t.y - n), t.y + t.height + n)
  };
}
function R1(e) {
  const t = e.inGoalM, n = e.inGoalM + e.lengthM, r = t + e.lengthM / 2;
  return [
    { y: t, name: "try" },
    { y: t + 22, name: "22" },
    { y: r - 10, name: "10" },
    { y: r, name: "halfway" },
    { y: r + 10, name: "10" },
    { y: n - 22, name: "22" },
    { y: n, name: "try" }
  ];
}
function D1(e) {
  return [
    { x: 5, name: "5m" },
    { x: 15, name: "15m" },
    { x: e.widthM / 2, name: "centre" },
    { x: e.widthM - 15, name: "15m" },
    { x: e.widthM - 5, name: "5m" }
  ];
}
const z1 = 1;
function A1(e, t, n, r = z1) {
  const o = [
    ...D1(n).map((c) => ({ axis: "x", at: c.x, source: "pitch", name: c.name })),
    ...t.map((c) => ({ axis: "x", at: c.x, source: "object" }))
  ], s = [
    ...R1(n).map((c) => ({ axis: "y", at: c.y, source: "pitch", name: c.name })),
    ...t.map((c) => ({ axis: "y", at: c.y, source: "object" }))
  ], i = (c, p) => {
    let g, w = r;
    for (const x of c) {
      const k = Math.abs(x.at - p);
      (k < w || k === w && g && x.source === "object") && (w = k, g = x);
    }
    return g;
  }, a = i(o, e.x), l = i(s, e.y), u = [];
  return a && u.push(a), l && u.push(l), { point: { x: a ? a.at : e.x, y: l ? l.at : e.y }, guides: u };
}
function On(e, t) {
  const n = e.fromObjectId && t?.[e.fromObjectId] || e.points[0], r = e.toObjectId && t?.[e.toObjectId] || e.points[e.points.length - 1], o = { start: { x: n.x, y: n.y }, end: { x: r.x, y: r.y } };
  return e.control && (o.control = e.control), o;
}
function Yc(e, t) {
  const n = Math.min(1, Math.max(0, t));
  if (!e.control) return { x: e.start.x + (e.end.x - e.start.x) * n, y: e.start.y + (e.end.y - e.start.y) * n };
  const r = 1 - n;
  return {
    x: r * r * e.start.x + 2 * r * n * e.control.x + n * n * e.end.x,
    y: r * r * e.start.y + 2 * r * n * e.control.y + n * n * e.end.y
  };
}
function L1(e, t) {
  const n = Math.min(1, Math.max(0, t));
  let r, o;
  e.control ? (r = 2 * (1 - n) * (e.control.x - e.start.x) + 2 * n * (e.end.x - e.control.x), o = 2 * (1 - n) * (e.control.y - e.start.y) + 2 * n * (e.end.y - e.control.y)) : (r = e.end.x - e.start.x, o = e.end.y - e.start.y);
  const s = Math.hypot(r, o) || 1;
  return { x: r / s, y: o / s };
}
function np(e, t) {
  const n = Math.min(1, Math.max(0, t));
  return 4 * e * n * (1 - n);
}
function F1(e, t, n = 0.25) {
  const r = (e.x + t.x) / 2, o = (e.y + t.y) / 2, s = t.x - e.x, i = t.y - e.y;
  return { x: r - i * n, y: o + s * n };
}
function rp(e, t) {
  const n = { ...e, points: e.points.map((r) => ({ x: r.x + t.x, y: r.y + t.y })) };
  return e.control && (n.control = { x: e.control.x + t.x, y: e.control.y + t.y }), n;
}
function B1(e, t, n, r = []) {
  let o, s = n;
  for (const [i, a] of Object.entries(t)) {
    if (r.includes(i)) continue;
    const l = Math.hypot(a.x - e.x, a.y - e.y);
    l < s && (s = l, o = i);
  }
  return o;
}
const Ty = (e) => e, V1 = (e) => e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2, Ny = { linear: Ty, easeInOut: V1 }, U1 = "easeInOut";
function op(e, t, n) {
  return e + (t - e) * n;
}
function Wo(e, t, n) {
  const o = e.steps[t]?.poses[n];
  if (o) return { x: o.x, y: o.y };
  for (let s = t - 1; s >= 0; s--) {
    const i = e.steps[s]?.poses[n];
    if (i) return { x: i.x, y: i.y };
  }
  for (let s = t + 1; s < e.steps.length; s++) {
    const i = e.steps[s]?.poses[n];
    if (i) return { x: i.x, y: i.y };
  }
}
const Oy = 2.5;
function W1(e, t, n) {
  const r = e.steps[t], o = e.objects.find((s) => s.id === n);
  if (!(!r || !o)) {
    if (o.type === "player") return r.drawings.find((s) => s.type === "run" && s.fromObjectId === n);
    if (o.type === "ball") {
      const s = Wo(e, t, n), i = (l) => {
        const u = Wo(e, t, l);
        return !!(s && u && Math.hypot(u.x - s.x, u.y - s.y) <= Oy);
      }, a = r.drawings.find((l) => (l.type === "pass" || l.type === "kick") && !!l.fromObjectId && (l.fromObjectId === n || i(l.fromObjectId)));
      return a || r.drawings.find((l) => l.type === "run" && !!l.fromObjectId && i(l.fromObjectId));
    }
  }
}
function Gc(e, t, n = Ty) {
  const r = e.steps.length - 1, o = Math.min(Math.max(t, 0), r), s = Math.floor(o), i = o - s, a = {};
  for (const l of e.objects) {
    const u = Wo(e, s, l.id);
    if (!u) continue;
    if (i === 0 || s >= r) {
      a[l.id] = u;
      continue;
    }
    const c = Wo(e, s + 1, l.id) ?? u, p = n(i), g = W1(e, s, l.id);
    if (g?.control && (u.x !== c.x || u.y !== c.y)) {
      let w = g.control;
      if (l.type === "ball" && g.type === "run" && g.fromObjectId) {
        const b = Wo(e, s, g.fromObjectId);
        b && (w = { x: g.control.x + (u.x - b.x), y: g.control.y + (u.y - b.y) });
      }
      const k = Yc({ start: u, end: c, control: w }, p);
      a[l.id] = g.type === "kick" && g.arcHeight ? { ...k, z: np(g.arcHeight, p) } : k;
    } else {
      const w = { x: op(u.x, c.x, p), y: op(u.y, c.y, p) };
      g?.type === "kick" && g.arcHeight && (u.x !== c.x || u.y !== c.y) && (w.z = np(g.arcHeight, p)), a[l.id] = w;
    }
  }
  return a;
}
function ks(e) {
  return e.steps.slice(0, -1).reduce((t, n) => t + n.durationMs, 0);
}
function H1(e, t) {
  let n = Math.max(0, t);
  for (let r = 0; r < e.steps.length - 1; r++) {
    const o = e.steps[r].durationMs;
    if (n < o) return r + n / o;
    n -= o;
  }
  return e.steps.length - 1;
}
function Z1(e, t) {
  const n = e.steps.length - 1, r = Math.min(Math.max(t, 0), n), o = Math.floor(r);
  let s = 0;
  for (let i = 0; i < o; i++) s += e.steps[i].durationMs;
  return o < n && (s += (r - o) * e.steps[o].durationMs), s;
}
function Q1(e, t, n, r) {
  const o = e.steps.map((a) => ({ ...a, poses: { ...a.poses } })), s = o[t];
  if (!s) throw new Error(`Step ${t} out of range`);
  s.poses[n] = { x: r.x, y: r.y, pinned: !0 };
  for (let a = t + 1; a < o.length; a++) {
    const l = o[a];
    if (l.poses[n]?.pinned) break;
    l.poses[n] = { x: r.x, y: r.y, pinned: !1 };
  }
  if (!o.slice(0, t).some((a) => a.poses[n]?.pinned))
    for (let a = 0; a < t; a++)
      o[a].poses[n] = { x: r.x, y: r.y, pinned: !1 };
  return o;
}
function K1(e, t) {
  const n = e.steps[t];
  if (!n) return {};
  const r = Gc(e, t), o = {}, s = e.objects.find((u) => u.type === "ball"), i = s ? r[s.id] : void 0, a = (u, c) => !!(u && c && Math.hypot(u.x - c.x, u.y - c.y) <= Oy);
  let l = !1;
  for (const u of n.drawings) {
    const c = On(u, r);
    u.type === "run" && u.fromObjectId ? o[u.fromObjectId] = { x: c.end.x, y: c.end.y } : (u.type === "pass" || u.type === "kick") && s && u.fromObjectId && (u.fromObjectId === s.id || a(r[u.fromObjectId], i)) && (o[s.id] = { x: c.end.x, y: c.end.y }, l = !0);
  }
  if (s && i && !l)
    for (const u of n.drawings) {
      if (u.type !== "run" || !u.fromObjectId) continue;
      const c = r[u.fromObjectId];
      if (!a(c, i)) continue;
      const p = On(u, r);
      o[s.id] = { x: p.end.x + (i.x - c.x), y: p.end.y + (i.y - c.y) };
      break;
    }
  return o;
}
function sp(e, t, n) {
  const r = K1(e, t), o = e.steps[n];
  if (!o || Object.keys(r).length === 0) return e.steps;
  const s = { ...o.poses };
  let i = !1;
  for (const [a, l] of Object.entries(r)) {
    const u = s[a];
    u?.pinned || u && u.x === l.x && u.y === l.y || (s[a] = { x: l.x, y: l.y, pinned: !1 }, i = !0);
  }
  return i ? e.steps.map((a, l) => l === n ? { ...a, poses: s } : a) : e.steps;
}
function Y1(e, t) {
  return e.map((n) => {
    const r = { ...n, id: t(n), points: n.points.map((o) => ({ ...o })) };
    return n.control && (r.control = { ...n.control }), r;
  });
}
function Py(e, t) {
  return e.objects.filter((n) => n.type === "player" && (t === void 0 || n.colour === t));
}
function My(e, t) {
  const n = new Set(Py(e, t).map((r) => r.number));
  for (let r = 1; r < 1e3; r++) {
    const o = String(r);
    if (!n.has(o)) return o;
  }
  return "";
}
function G1(e) {
  return e === "" || /^[1-9][0-9]?$/.test(e) || /^[A-Za-z]{1,2}$/.test(e);
}
function Ry(e, t) {
  const n = e.objects.find((r) => r.id === t && r.type === "player");
  return !n || n.number === "" ? [] : Py(e, n.colour).filter((r) => r.id !== n.id && r.number === n.number).map((r) => r.id);
}
function xe(e) {
  return { ...e, revision: e.revision + 1 };
}
function _n(e, t) {
  const n = e.steps[t];
  if (!n) throw new Error(`Step ${t} not found`);
  return n;
}
function Ws(e, t) {
  const n = e.objects.find((r) => r.id === t);
  if (!n) throw new Error(`Object ${t} not found`);
  return n;
}
function yl(e, t, n, r) {
  return n.type === "cone" ? e.steps.map((o, s) => ({ ...o, poses: { ...o.poses, [n.id]: { x: r.x, y: r.y, pinned: s === 0 } } })) : Q1(e, t, n.id, r);
}
function qt(e, t) {
  switch (t.type) {
    case "addObject": {
      if (e.objects.some((o) => o.id === t.object.id)) throw new Error(`Object ${t.object.id} exists`);
      const n = { ...e, objects: [...e.objects, t.object] }, r = yl(n, t.stepIndex, t.object, t.position);
      return { board: xe({ ...n, steps: r }), inverse: { type: "removeObject", objectId: t.object.id } };
    }
    case "removeObject":
      return qt(e, { type: "removeObjects", objectIds: [t.objectId] });
    case "removeObjects": {
      const n = new Set(t.objectIds), r = [];
      if (e.objects.forEach((i, a) => {
        if (!n.has(i.id)) return;
        const l = {};
        e.steps.forEach((u, c) => {
          const p = u.poses[i.id];
          p && (l[String(c)] = p);
        }), r.push({ type: "restoreObject", object: i, index: a, poses: l });
      }), r.length !== n.size) throw new Error("One or more objects not found");
      const o = e.objects.filter((i) => !n.has(i.id)), s = e.steps.map((i) => {
        const a = {};
        for (const [u, c] of Object.entries(i.poses)) n.has(u) || (a[u] = c);
        const l = i.drawings.filter((u) => !(u.fromObjectId && n.has(u.fromObjectId)) && !(u.toObjectId && n.has(u.toObjectId)));
        return { ...i, poses: a, drawings: l };
      });
      return { board: xe({ ...e, objects: o, steps: s }), inverse: { type: "batch", commands: [...r, { type: "restoreSteps", steps: e.steps }] } };
    }
    case "restoreObject": {
      const n = [...e.objects];
      n.splice(Math.min(t.index, n.length), 0, t.object);
      const r = e.steps.map((o, s) => {
        const i = t.poses[String(s)];
        return i ? { ...o, poses: { ...o.poses, [t.object.id]: i } } : o;
      });
      return { board: xe({ ...e, objects: n, steps: r }), inverse: { type: "removeObject", objectId: t.object.id } };
    }
    case "moveObject": {
      const n = Ws(e, t.objectId), r = e.steps, o = yl(e, t.stepIndex, n, t.to);
      return { board: xe({ ...e, steps: o }), inverse: { type: "restoreSteps", steps: r } };
    }
    case "moveObjects": {
      const n = e.steps;
      let r = e;
      for (const o of t.objectIds) {
        const s = Ws(r, o), i = r.steps[t.stepIndex]?.poses[o];
        if (!i) continue;
        const a = yl(r, t.stepIndex, s, { x: i.x + t.delta.x, y: i.y + t.delta.y });
        r = { ...r, steps: a };
      }
      return { board: xe({ ...r, steps: r.steps }), inverse: { type: "restoreSteps", steps: n } };
    }
    case "restoreSteps": {
      const n = e.steps;
      return { board: xe({ ...e, steps: t.steps }), inverse: { type: "restoreSteps", steps: n } };
    }
    case "updateObject": {
      const n = Ws(e, t.objectId), r = {}, o = {};
      for (const i of Object.keys(t.patch))
        if (i === "colour")
          r.colour = n.colour, t.patch.colour !== void 0 && (o.colour = t.patch.colour);
        else if (n.type === "player") {
          r[i] = n[i];
          const a = t.patch[i];
          a !== void 0 && (o[i] = a);
        }
      const s = e.objects.map((i) => i.id === t.objectId ? { ...i, ...o } : i);
      return { board: xe({ ...e, objects: s }), inverse: { type: "updateObject", objectId: t.objectId, patch: r } };
    }
    case "duplicateObjects": {
      if (t.newIds.length !== t.objectIds.length) throw new Error("newIds must match objectIds");
      let n = e;
      const r = [];
      return t.objectIds.forEach((o, s) => {
        const i = Ws(n, o), a = t.newIds[s];
        if (n.objects.some((c) => c.id === a)) throw new Error(`Object ${a} exists`);
        let l = { ...i, id: a };
        l.type === "player" && (l = { ...l, number: My(n, l.colour) });
        const u = n.steps.map((c) => {
          const p = c.poses[o];
          return p ? { ...c, poses: { ...c.poses, [a]: { x: p.x + t.offset.x, y: p.y + t.offset.y, pinned: p.pinned } } } : c;
        });
        n = { ...n, objects: [...n.objects, l], steps: u }, r.push(a);
      }), { board: xe(n), inverse: { type: "removeObjects", objectIds: r } };
    }
    case "setPitchView": {
      const n = e.pitch, r = t.preset ?? n.preset, o = t.orientation ?? n.orientation, s = { ...n, preset: r, orientation: o, viewport: r === n.preset ? n.viewport : Kc(n, r) };
      return { board: xe({ ...e, pitch: s }), inverse: { type: "setPitchView", preset: n.preset, orientation: n.orientation } };
    }
    case "setMetadata": {
      const n = {};
      for (const s of Object.keys(t.patch)) n[s] = e.metadata[s];
      const r = t.patch.name !== void 0 && t.patch.name.trim() || e.metadata.name, o = { ...e.metadata, ...t.patch, name: r };
      return { board: xe({ ...e, metadata: o }), inverse: { type: "setMetadata", patch: n } };
    }
    case "addDrawing": {
      const n = _n(e, t.stepIndex);
      if (e.steps.some((o) => o.drawings.some((s) => s.id === t.drawing.id))) throw new Error(`Drawing ${t.drawing.id} exists`);
      for (const o of [t.drawing.fromObjectId, t.drawing.toObjectId]) if (o && !e.objects.some((s) => s.id === o)) throw new Error(`Unknown object ${o}`);
      let r = e.steps.map((o, s) => s === t.stepIndex ? { ...o, drawings: [...n.drawings, t.drawing] } : o);
      return t.stepIndex + 1 < r.length && (r = sp({ ...e, steps: r }, t.stepIndex, t.stepIndex + 1)), { board: xe({ ...e, steps: r }), inverse: { type: "restoreSteps", steps: e.steps } };
    }
    case "restoreDrawing": {
      const r = [..._n(e, t.stepIndex).drawings];
      r.splice(Math.min(t.index, r.length), 0, t.drawing);
      const o = e.steps.map((s, i) => i === t.stepIndex ? { ...s, drawings: r } : s);
      return { board: xe({ ...e, steps: o }), inverse: { type: "removeDrawings", stepIndex: t.stepIndex, drawingIds: [t.drawing.id] } };
    }
    case "removeDrawings": {
      const n = _n(e, t.stepIndex), r = new Set(t.drawingIds), o = [];
      if (n.drawings.forEach((i, a) => {
        r.has(i.id) && o.push({ type: "restoreDrawing", stepIndex: t.stepIndex, drawing: i, index: a });
      }), o.length !== r.size) throw new Error("One or more drawings not found in step");
      const s = e.steps.map((i, a) => a === t.stepIndex ? { ...i, drawings: i.drawings.filter((l) => !r.has(l.id)) } : i);
      return { board: xe({ ...e, steps: s }), inverse: { type: "batch", commands: o } };
    }
    case "updateDrawing": {
      const r = _n(e, t.stepIndex).drawings.find((l) => l.id === t.drawingId);
      if (!r) throw new Error(`Drawing ${t.drawingId} not found`);
      for (const l of [t.patch.fromObjectId, t.patch.toObjectId]) if (l && !e.objects.some((u) => u.id === l)) throw new Error(`Unknown object ${l}`);
      const o = { ...r }, s = {}, i = ["control", "arcHeight", "fromObjectId", "toObjectId", "text"];
      for (const l of i) {
        if (!(l in t.patch)) continue;
        s[l] = r[l] ?? null;
        const u = t.patch[l];
        u == null ? delete o[l] : o[l] = u;
      }
      t.patch.points && (s.points = r.points, o.points = t.patch.points), t.patch.colour && (s.colour = r.colour, o.colour = t.patch.colour), t.patch.type && (s.type = r.type, o.type = t.patch.type);
      const a = e.steps.map((l, u) => u === t.stepIndex ? { ...l, drawings: l.drawings.map((c) => c.id === t.drawingId ? o : c) } : l);
      return { board: xe({ ...e, steps: a }), inverse: { type: "updateDrawing", stepIndex: t.stepIndex, drawingId: t.drawingId, patch: s } };
    }
    case "moveDrawings": {
      const n = _n(e, t.stepIndex), r = new Set(t.drawingIds), o = n.drawings.map((i) => {
        if (!r.has(i.id)) return i;
        const { fromObjectId: a, toObjectId: l, ...u } = rp(i, t.delta);
        return u;
      }), s = e.steps.map((i, a) => a === t.stepIndex ? { ...i, drawings: o } : i);
      return { board: xe({ ...e, steps: s }), inverse: { type: "restoreSteps", steps: e.steps } };
    }
    case "duplicateDrawings": {
      const n = _n(e, t.stepIndex);
      if (t.newIds.length !== t.drawingIds.length) throw new Error("newIds must match drawingIds");
      const r = [];
      t.drawingIds.forEach((s, i) => {
        const a = n.drawings.find((p) => p.id === s);
        if (!a) throw new Error(`Drawing ${s} not found`);
        const { fromObjectId: l, toObjectId: u, ...c } = rp(a, t.offset);
        r.push({ ...c, id: t.newIds[i] });
      });
      const o = e.steps.map((s, i) => i === t.stepIndex ? { ...s, drawings: [...s.drawings, ...r] } : s);
      return { board: xe({ ...e, steps: o }), inverse: { type: "removeDrawings", stepIndex: t.stepIndex, drawingIds: r.map((s) => s.id) } };
    }
    case "addStep": {
      if (e.steps.some((o) => o.id === t.step.id)) throw new Error(`Step ${t.step.id} exists`);
      let n = [...e.steps];
      const r = Math.min(Math.max(0, t.afterIndex + 1), n.length);
      return n.splice(r, 0, t.step), t.applyTargets !== !1 && r > 0 && (n = sp({ ...e, steps: n }, r - 1, r)), { board: xe({ ...e, steps: n }), inverse: { type: "removeStep", index: r } };
    }
    case "duplicateStep": {
      const n = _n(e, t.index);
      if (e.steps.some((l) => l.id === t.newId)) throw new Error(`Step ${t.newId} exists`);
      let r = 0;
      const o = Y1(n.drawings, (l) => t.drawingIds?.[r++] ?? `${l.id}_${t.newId}`), s = {};
      for (const [l, u] of Object.entries(n.poses)) s[l] = { ...u };
      const i = { ...n, id: t.newId, poses: s, drawings: o }, a = [...e.steps];
      return a.splice(t.index + 1, 0, i), { board: xe({ ...e, steps: a }), inverse: { type: "removeStep", index: t.index + 1 } };
    }
    case "moveStep": {
      const n = e.steps.length;
      if (t.from < 0 || t.from >= n || t.to < 0 || t.to >= n) throw new Error("moveStep index out of range");
      if (t.from === t.to) return { board: e, inverse: t };
      const r = [...e.steps], [o] = r.splice(t.from, 1);
      return r.splice(t.to, 0, o), { board: xe({ ...e, steps: r }), inverse: { type: "moveStep", from: t.to, to: t.from } };
    }
    case "setStepLabel": {
      const n = _n(e, t.index), r = e.steps.map((o, s) => s === t.index ? { ...o, label: t.label } : o);
      return { board: xe({ ...e, steps: r }), inverse: { type: "setStepLabel", index: t.index, label: n.label } };
    }
    case "removeStep": {
      if (e.steps.length <= 1) throw new Error("Cannot remove the only step");
      const n = e.steps[t.index];
      if (!n) throw new Error(`Step ${t.index} not found`);
      const r = e.steps.filter((o, s) => s !== t.index);
      return { board: xe({ ...e, steps: r }), inverse: { type: "addStep", afterIndex: t.index - 1, step: n } };
    }
    case "setStepNote": {
      const n = e.steps[t.index];
      if (!n) throw new Error(`Step ${t.index} not found`);
      const r = e.steps.map((o, s) => s === t.index ? { ...o, note: t.note } : o);
      return { board: xe({ ...e, steps: r }), inverse: { type: "setStepNote", index: t.index, note: n.note } };
    }
    case "setStepDuration": {
      const n = e.steps[t.index];
      if (!n) throw new Error(`Step ${t.index} not found`);
      const r = e.steps.map((o, s) => s === t.index ? { ...o, durationMs: t.durationMs } : o);
      return { board: xe({ ...e, steps: r }), inverse: { type: "setStepDuration", index: t.index, durationMs: n.durationMs } };
    }
    case "batch": {
      let n = e;
      const r = [];
      for (const o of t.commands) {
        const s = qt(n, o);
        n = s.board, r.unshift(s.inverse);
      }
      return { board: n, inverse: { type: "batch", commands: r } };
    }
  }
}
function Ru(e, t) {
  const n = {};
  for (const [r, o] of Object.entries(e.poses)) n[r] = { x: o.x, y: o.y, pinned: !1 };
  return { id: t, durationMs: e.durationMs, label: "", note: "", poses: n, drawings: [] };
}
function X1(e, t = 200) {
  return { board: e, undo: [], redo: [], limit: t };
}
function J1(e, t) {
  const { board: n, inverse: r } = qt(e.board, t), o = [...e.undo, r].slice(-e.limit);
  return { ...e, board: n, undo: o, redo: [] };
}
function q1(e) {
  return e.undo.length > 0;
}
function ew(e) {
  return e.redo.length > 0;
}
function tw(e) {
  const t = e.undo[e.undo.length - 1];
  if (!t) return e;
  const { board: n, inverse: r } = qt(e.board, t);
  return { ...e, board: n, undo: e.undo.slice(0, -1), redo: [...e.redo, r] };
}
function nw(e) {
  const t = e.redo[e.redo.length - 1];
  if (!t) return e;
  const { board: n, inverse: r } = qt(e.board, t);
  return { ...e, board: n, undo: [...e.undo, r], redo: e.redo.slice(0, -1) };
}
const rw = {
  /**
   * v1 → v2 (Build 7, integration contract). Three renames proved necessary by
   * reading the host: `tenantId` was redundant (the host's tenant IS the club),
   * players carry an opaque host key rather than a "squad member id", and the
   * host's real operating unit (group) had no scope value.
   */
  1: (e) => {
    const t = { ...e.metadata ?? {} };
    t.tenantId && !t.clubId && (t.clubId = t.tenantId), delete t.tenantId;
    const n = (e.objects ?? []).map((r) => {
      if (r.type !== "player" || r.squadMemberId === void 0) return r;
      const { squadMemberId: o, ...s } = r;
      return o ? { ...s, hostPlayerKey: o } : s;
    });
    return { ...e, schemaVersion: 2, metadata: t, objects: n };
  },
  0: (e) => {
    const t = e.players ?? [], n = e.items ?? [], { players: r, items: o, ...s } = e;
    return { ...s, schemaVersion: 1, objects: [...t, ...n] };
  }
};
function ow(e) {
  if (typeof e != "object" || e === null) throw new Error("Board document must be an object");
  const t = e.schemaVersion;
  if (t === void 0) return 0;
  if (typeof t != "number" || !Number.isInteger(t) || t < 0) throw new Error(`Invalid schemaVersion: ${String(t)}`);
  return t;
}
function sw(e) {
  let t = ow(e);
  if (t > Uo)
    throw new Error(`Board schemaVersion ${t} is newer than supported ${Uo}`);
  let n = { ...e };
  for (; t < Uo; ) {
    const r = rw[t];
    if (!r) throw new Error(`No migration registered from version ${t}`);
    n = r(n), t += 1;
  }
  return I1.parse(n);
}
function vt(e = "id") {
  const t = Math.random().toString(36).slice(2, 10);
  return `${e}_${Date.now().toString(36)}_${t}`;
}
const Dy = { tactic: "Untitled Tactic", drill: "Untitled Drill" };
function iw(e = "half", t = "portrait") {
  return {
    code: "union",
    preset: e,
    orientation: t,
    ...tp,
    viewport: Kc(tp, e)
  };
}
function Du(e = {}) {
  const t = e.now ?? (/* @__PURE__ */ new Date()).toISOString();
  return {
    schemaVersion: Uo,
    id: e.id ?? vt("board"),
    revision: 0,
    metadata: {
      name: e.name?.trim() || Dy[e.kind ?? "tactic"],
      description: "",
      kind: e.kind ?? "tactic",
      category: [],
      tags: [],
      isTemplate: !1,
      favourite: !1,
      scope: "private",
      attachments: [],
      createdAt: t,
      updatedAt: t
    },
    pitch: iw(e.preset ?? "half", e.orientation ?? "portrait"),
    teamColours: { teamA: "#1d4ed8", teamB: "#dc2626" },
    objects: [],
    steps: [{ id: e.id ? `${e.id}_step1` : vt("step"), durationMs: $y, label: "", note: "", poses: {}, drawings: [] }]
  };
}
function zy(e = {}) {
  const t = { id: e.id ?? vt("player"), type: "player", colour: e.colour ?? "teamA", number: e.number ?? "", label: e.label ?? "" };
  return e.hostPlayerKey && (t.hostPlayerKey = e.hostPlayerKey), t;
}
function gl(e, t, n) {
  return {
    ...e,
    objects: [...e.objects, t],
    steps: e.steps.map((r, o) => ({ ...r, poses: { ...r.poses, [t.id]: { ...n, pinned: o === 0 } } }))
  };
}
function Ay(e = vt("ball")) {
  return { id: e, type: "ball", colour: "ball" };
}
function Ly(e = vt("cone"), t = "neutral1") {
  return { id: e, type: "cone", colour: t };
}
function zu(e, t, n, r = {}) {
  const o = { id: r.id ?? vt(e), type: e, points: [t, n], colour: r.colour ?? aw(e) };
  return e === "kick" && (o.arcHeight = r.arcHeight ?? 0.5), r.control && (o.control = r.control), r.fromObjectId && (o.fromObjectId = r.fromObjectId), r.toObjectId && (o.toObjectId = r.toObjectId), r.text !== void 0 && (o.text = r.text), o;
}
function aw(e) {
  switch (e) {
    case "run":
      return "teamA";
    case "pass":
      return "ball";
    case "kick":
      return "ball";
    case "defence":
      return "teamB";
    default:
      return "neutral3";
  }
}
function Fy(e, t = {}) {
  const n = JSON.parse(JSON.stringify(e)), r = t.now ?? (/* @__PURE__ */ new Date()).toISOString();
  return n.id = t.id ?? vt("board"), n.revision = 0, n.metadata = {
    ...n.metadata,
    name: t.name?.trim() || `${e.metadata.name} Copy`,
    favourite: !1,
    isTemplate: !1,
    duplicatedFromId: e.id,
    createdAt: r,
    updatedAt: r
  }, n;
}
function lw(e, t = {}) {
  const n = Fy(e, { ...t.id ? { id: t.id } : {}, name: t.name ?? e.metadata.name, ...t.now ? { now: t.now } : {} });
  return n.metadata.templateId = e.id, n.metadata.isTemplate = !1, delete n.metadata.duplicatedFromId, t.kind && (n.metadata.kind = t.kind), n;
}
function By(e, t = !0) {
  return t ? JSON.stringify(e, null, 2) : JSON.stringify(e);
}
function uw(e) {
  return sw(JSON.parse(e));
}
const cw = { playing: !1, elapsedMs: 0, loop: !1, speed: 1 };
function dw(e, t, n) {
  if (!t.playing) return t;
  const r = ks(e);
  if (r <= 0) return { ...t, playing: !1, elapsedMs: 0 };
  let o = t.elapsedMs + n * t.speed;
  return o >= r ? t.loop ? { ...t, elapsedMs: o % r } : { ...t, playing: !1, elapsedMs: r } : { ...t, elapsedMs: o };
}
function Vy(e, t) {
  return H1(e, t.elapsedMs);
}
function Au(e, t) {
  return Math.min(Math.floor(Vy(e, t)), e.steps.length - 1);
}
function fw(e, t) {
  const n = ks(e), r = t.elapsedMs >= n ? 0 : t.elapsedMs;
  return { ...t, playing: n > 0, elapsedMs: r };
}
function vl(e) {
  return e.playing ? { ...e, playing: !1 } : e;
}
function xl(e, t, n) {
  const r = Math.min(Math.max(0, n), e.steps.length - 1);
  return { ...t, playing: !1, elapsedMs: Z1(e, r) };
}
function pw(e, t, n) {
  const r = Math.min(Math.max(0, n), 1);
  return { ...t, playing: !1, elapsedMs: r * ks(e) };
}
const hw = "2026-01-01T00:00:00.000Z";
function mw(e) {
  let t = Du({ id: e.info.id, name: e.info.name, kind: e.info.kind, preset: e.preset, now: hw });
  t.metadata.isTemplate = !0, t.metadata.description = e.info.description, t.metadata.category = [e.info.category];
  for (const r of e.players) {
    const o = zy({ id: r.id, colour: r.team, number: r.n, ...r.label ? { label: r.label } : {} });
    t = gl(t, o, r.at);
  }
  e.ball && (t = gl(t, Ay("ball"), e.ball)), (e.cones ?? []).forEach((r, o) => t = gl(t, Ly(`cone${o + 1}`), r)), e.firstNote && (t.steps[0].note = e.firstNote);
  let n = 0;
  for (const r of e.steps ?? []) {
    for (const o of r.drawings ?? []) t = qt(t, { type: "addDrawing", stepIndex: n, drawing: o }).board;
    t = qt(t, { type: "addStep", afterIndex: n, step: Ru(t.steps[n], `${e.info.id}_s${n + 2}`) }).board, n += 1;
    for (const [o, s] of Object.entries(r.moves ?? {})) t = qt(t, { type: "moveObject", objectId: o, stepIndex: n, to: s }).board;
    r.note && (t = qt(t, { type: "setStepNote", index: n, note: r.note }).board), r.label && (t = qt(t, { type: "setStepLabel", index: n, label: r.label }).board);
  }
  return { ...t, revision: 0 };
}
const Q = (e, t, n, r, o, s) => ({ id: e, team: t, n, at: { x: r, y: o } }), J = (e, t, n, r = {}) => zu(e, t, n, { id: `${e}_${t.x}_${t.y}_${n.x}_${n.y}`, ...r }), er = (e) => Array.from({ length: 10 }, (t, n) => Q(`b${n + 1}`, "teamB", String(n + 1), 12 + n * 5, e)), Uy = [
  {
    info: { id: "tpl_basic_backline", name: "Basic Backline", kind: "tactic", category: "attack", description: "9 to 10, 10 to 12, 12 to 13 — the shape every backline starts from." },
    preset: "half",
    players: [Q("a9", "teamA", "9", 30, 92), Q("a10", "teamA", "10", 36, 97), Q("a12", "teamA", "12", 44, 101), Q("a13", "teamA", "13", 52, 104), Q("a11", "teamA", "11", 62, 106), Q("a15", "teamA", "15", 46, 110), ...er(82)],
    ball: { x: 30.5, y: 92.5 },
    firstNote: "Set the shape: 9 at the ruck, backline on a diagonal.",
    steps: [
      { note: "9 passes to 10; 10 straightens.", drawings: [J("pass", { x: 30, y: 92 }, { x: 36, y: 97 }, { fromObjectId: "a9", toObjectId: "a10" }), J("run", { x: 36, y: 97 }, { x: 38, y: 90 }, { fromObjectId: "a10" })] },
      { note: "10 to 12, 12 attacks the line.", drawings: [J("pass", { x: 38, y: 90 }, { x: 44, y: 101 }, { fromObjectId: "a10", toObjectId: "a12" }), J("run", { x: 44, y: 101 }, { x: 46, y: 92 }, { fromObjectId: "a12" })] },
      { note: "12 to 13, 13 hits the gap.", drawings: [J("pass", { x: 46, y: 92 }, { x: 52, y: 104 }, { fromObjectId: "a12", toObjectId: "a13" }), J("run", { x: 52, y: 104 }, { x: 56, y: 84 }, { fromObjectId: "a13" })] }
    ]
  },
  {
    info: { id: "tpl_switch", name: "9/10 Switch", kind: "tactic", category: "attack", description: "10 runs across 9's line and takes a short switch pass back against the drift." },
    preset: "half",
    players: [Q("a9", "teamA", "9", 30, 92), Q("a10", "teamA", "10", 38, 97), Q("a12", "teamA", "12", 46, 101), Q("a13", "teamA", "13", 54, 104), ...er(82)],
    ball: { x: 30.5, y: 92.5 },
    firstNote: "9 carries flat; 10 lines up wide.",
    steps: [
      { note: "9 runs across; 10 angles back inside.", drawings: [J("run", { x: 30, y: 92 }, { x: 38, y: 88 }, { fromObjectId: "a9" }), J("run", { x: 38, y: 97 }, { x: 31, y: 87 }, { fromObjectId: "a10", control: { x: 34, y: 96 } })] },
      { note: "Switch pass; 10 hits the hole behind 9.", drawings: [J("pass", { x: 38, y: 88 }, { x: 31, y: 87 }, { fromObjectId: "a9", toObjectId: "a10" }), J("run", { x: 31, y: 87 }, { x: 27, y: 78 }, { fromObjectId: "a10" })] }
    ]
  },
  {
    info: { id: "tpl_loop", name: "Loop", kind: "tactic", category: "attack", description: "10 passes to 12 and loops around to receive it back on the outside." },
    preset: "half",
    players: [Q("a9", "teamA", "9", 30, 92), Q("a10", "teamA", "10", 36, 97), Q("a12", "teamA", "12", 44, 100), Q("a13", "teamA", "13", 54, 103), Q("a11", "teamA", "11", 64, 105), ...er(82)],
    ball: { x: 36.5, y: 97.5 },
    firstNote: "10 has the ball; 12 flat and square.",
    steps: [
      { note: "10 passes to 12 and loops around.", drawings: [J("pass", { x: 36, y: 97 }, { x: 44, y: 100 }, { fromObjectId: "a10", toObjectId: "a12" }), J("run", { x: 36, y: 97 }, { x: 50, y: 99 }, { fromObjectId: "a10", control: { x: 44, y: 106 } }), J("run", { x: 44, y: 100 }, { x: 45, y: 93 }, { fromObjectId: "a12" })] },
      { note: "12 gives it back to 10 on the outside.", drawings: [J("pass", { x: 45, y: 93 }, { x: 50, y: 99 }, { fromObjectId: "a12", toObjectId: "a10" }), J("run", { x: 50, y: 99 }, { x: 58, y: 84 }, { fromObjectId: "a10" })] }
    ]
  },
  {
    info: { id: "tpl_flat_defence", name: "Flat Defence", kind: "tactic", category: "defence", description: "A connected line that moves up together off the ruck." },
    preset: "half",
    players: [...er(84), Q("a9", "teamA", "9", 30, 96), Q("a10", "teamA", "10", 38, 100), Q("a12", "teamA", "12", 46, 103), Q("a13", "teamA", "13", 54, 106)],
    ball: { x: 30.5, y: 96.5 },
    firstNote: "Line set 1 m behind the offside line, spacing 5 m.",
    steps: [
      { note: "Line speed: everyone up together.", drawings: Array.from({ length: 10 }, (e, t) => J("defence", { x: 12 + t * 5, y: 84 }, { x: 12 + t * 5, y: 92 })), moves: Object.fromEntries(Array.from({ length: 10 }, (e, t) => [`b${t + 1}`, { x: 12 + t * 5, y: 92 }])) }
    ]
  },
  {
    info: { id: "tpl_drift", name: "Drift Defence", kind: "tactic", category: "defence", description: "Slide across as the ball goes wide; inside shoulder to inside shoulder." },
    preset: "half",
    players: [...er(84), Q("a9", "teamA", "9", 30, 96), Q("a10", "teamA", "10", 38, 100), Q("a12", "teamA", "12", 46, 103), Q("a13", "teamA", "13", 54, 106), Q("a11", "teamA", "11", 64, 108)],
    ball: { x: 30.5, y: 96.5 },
    firstNote: "Ball at 9; defence numbers up from the ruck.",
    steps: [
      { note: "Ball goes wide — drift with it, don't bite.", drawings: [J("pass", { x: 30, y: 96 }, { x: 38, y: 100 }, { fromObjectId: "a9", toObjectId: "a10" }), ...Array.from({ length: 6 }, (e, t) => J("defence", { x: 32 + t * 5, y: 84 }, { x: 37 + t * 5, y: 88 }))], moves: Object.fromEntries(Array.from({ length: 6 }, (e, t) => [`b${t + 5}`, { x: 37 + t * 5, y: 88 }])) },
      { note: "Keep sliding; 13 takes the winger.", drawings: [J("pass", { x: 38, y: 100 }, { x: 46, y: 103 }, { fromObjectId: "a10", toObjectId: "a12" }), ...Array.from({ length: 6 }, (e, t) => J("defence", { x: 37 + t * 5, y: 88 }, { x: 42 + t * 5, y: 92 }))], moves: Object.fromEntries(Array.from({ length: 6 }, (e, t) => [`b${t + 5}`, { x: 42 + t * 5, y: 92 }])) }
    ]
  },
  {
    info: { id: "tpl_blitz", name: "Blitz Defence", kind: "tactic", category: "defence", description: "Up and in — shut the space before the ball gets wide." },
    preset: "half",
    players: [...er(84), Q("a9", "teamA", "9", 30, 96), Q("a10", "teamA", "10", 38, 100), Q("a12", "teamA", "12", 46, 103), Q("a13", "teamA", "13", 54, 106)],
    ball: { x: 30.5, y: 96.5 },
    firstNote: "Trigger: as 9 lifts the ball.",
    steps: [
      { note: "Blitz — up and in, outside shoulder.", drawings: Array.from({ length: 6 }, (e, t) => J("defence", { x: 32 + t * 5, y: 84 }, { x: 28 + t * 5, y: 96 })), moves: Object.fromEntries(Array.from({ length: 6 }, (e, t) => [`b${t + 5}`, { x: 28 + t * 5, y: 96 }])) }
    ]
  },
  {
    info: { id: "tpl_exit_kick", name: "Exit Kick", kind: "tactic", category: "kicking", description: "Box kick from 9 with a chase line from the blindside." },
    preset: "half",
    players: [Q("a9", "teamA", "9", 30, 100), Q("a11", "teamA", "11", 14, 104), Q("a14", "teamA", "14", 60, 104), Q("a10", "teamA", "10", 40, 108), Q("a15", "teamA", "15", 35, 114), ...er(88)],
    ball: { x: 30.5, y: 100.5 },
    firstNote: "Ruck in our 22; 11 and 14 ready to chase.",
    steps: [
      { note: "9 box kicks; wingers go on the kick.", drawings: [J("kick", { x: 30, y: 100 }, { x: 20, y: 66 }, { fromObjectId: "a9", arcHeight: 0.9 }), J("run", { x: 14, y: 104 }, { x: 18, y: 70 }, { fromObjectId: "a11" }), J("run", { x: 60, y: 104 }, { x: 40, y: 76 }, { fromObjectId: "a14", control: { x: 52, y: 88 } })] },
      { note: "Contest in the air; line folds up behind.", drawings: [J("arrow", { x: 30, y: 100 }, { x: 30, y: 84 })] }
    ]
  },
  {
    info: { id: "tpl_kick_chase", name: "Kick Chase", kind: "tactic", category: "kicking", description: "10 kicks long; chase line stays connected and squeezes the return." },
    preset: "full",
    players: [Q("a10", "teamA", "10", 36, 88), Q("a9", "teamA", "9", 30, 84), Q("a11", "teamA", "11", 10, 90), Q("a14", "teamA", "14", 62, 90), Q("a12", "teamA", "12", 44, 92), Q("a13", "teamA", "13", 52, 92), Q("b15", "teamB", "15", 36, 30), Q("b11", "teamB", "11", 14, 40), Q("b14", "teamB", "14", 58, 40)],
    ball: { x: 36.5, y: 88.5 },
    firstNote: "Ball at 10 on our 10 m line.",
    steps: [
      { note: "10 kicks long; whole line chases together.", drawings: [J("kick", { x: 36, y: 88 }, { x: 40, y: 34 }, { fromObjectId: "a10", arcHeight: 0.7 }), J("run", { x: 10, y: 90 }, { x: 18, y: 56 }, { fromObjectId: "a11" }), J("run", { x: 62, y: 90 }, { x: 56, y: 56 }, { fromObjectId: "a14" }), J("run", { x: 44, y: 92 }, { x: 44, y: 60 }, { fromObjectId: "a12" }), J("run", { x: 52, y: 92 }, { x: 50, y: 60 }, { fromObjectId: "a13" })] },
      { note: "15 fields it; squeeze the return inside.", drawings: [J("defence", { x: 18, y: 56 }, { x: 30, y: 44 }), J("defence", { x: 56, y: 56 }, { x: 46, y: 44 })] }
    ]
  },
  {
    info: { id: "tpl_passing_drill", name: "Passing Drill", kind: "drill", category: "drill", description: "Four cones, three attackers: catch, carry, pass — then reload." },
    preset: "grid",
    players: [Q("a1", "teamA", "1", 6, 22), Q("a2", "teamA", "2", 12, 25), Q("a3", "teamA", "3", 18, 28)],
    ball: { x: 6.5, y: 22.5 },
    cones: [{ x: 4, y: 4 }, { x: 36, y: 4 }, { x: 4, y: 26 }, { x: 36, y: 26 }],
    firstNote: "Start on the line; ball with the inside player.",
    steps: [
      { note: "Run straight, pass along the line.", drawings: [J("run", { x: 6, y: 22 }, { x: 14, y: 14 }, { fromObjectId: "a1" }), J("run", { x: 12, y: 25 }, { x: 20, y: 17 }, { fromObjectId: "a2" }), J("run", { x: 18, y: 28 }, { x: 26, y: 20 }, { fromObjectId: "a3" }), J("pass", { x: 6, y: 22 }, { x: 12, y: 25 }, { fromObjectId: "a1", toObjectId: "a2" })] },
      { note: "Second pass; outside player scores in the corner.", drawings: [J("pass", { x: 20, y: 17 }, { x: 26, y: 20 }, { fromObjectId: "a2", toObjectId: "a3" }), J("run", { x: 26, y: 20 }, { x: 34, y: 8 }, { fromObjectId: "a3" })] }
    ]
  }
], wl = Uy.map((e) => e.info);
function Wy(e) {
  const t = Uy.find((n) => n.info.id === e);
  return t ? mw(t) : void 0;
}
const yw = "var(--tb-grass, #2f7d3a)", Hs = "var(--tb-line, rgba(255,255,255,0.9))";
function Hy({ pitch: e, frame: t }) {
  const { widthM: n, lengthM: r, inGoalM: o } = e, s = r + 2 * o, i = o, a = o + r, l = (I, Z) => Vt({ x: I, y: Z }, t), u = (I, Z = !1, B) => {
    const _e = l(0, I), M = l(n, I);
    return /* @__PURE__ */ d.jsx("line", { x1: _e.x, y1: _e.y, x2: M.x, y2: M.y, stroke: Hs, strokeWidth: 0.25, strokeDasharray: Z ? "1 1" : void 0 }, `h${I}`);
  }, c = [0, i, i + 22, a - 22, a, s], p = i + r / 2, g = [p - 10, p + 10], w = [5, 15, n - 15, n - 5], x = [i + 5, i + 22, p - 10, p, p + 10, a - 22, a - 5], k = (I, Z) => {
    const B = l(I, Z);
    return /* @__PURE__ */ d.jsx("line", { x1: B.x, y1: B.y - 1.5, x2: B.x, y2: B.y + 1.5, stroke: Hs, strokeWidth: 0.25 }, `c${I}-${Z}`);
  }, b = (I, Z) => {
    const B = l(I, Z - 1), _e = l(I, Z + 1);
    return /* @__PURE__ */ d.jsx("line", { x1: B.x, y1: B.y, x2: _e.x, y2: _e.y, stroke: Hs, strokeWidth: 0.25 }, `d${I}-${Z}`);
  }, v = l(0, 0), f = l(n, s), m = { x: Math.min(v.x, f.x), y: Math.min(v.y, f.y), w: Math.abs(f.x - v.x), h: Math.abs(f.y - v.y) }, S = l(0, i), _ = l(0, a), T = l(n, 0), R = l(n, s);
  return /* @__PURE__ */ d.jsxs("g", { "data-layer": "pitch", children: [
    /* @__PURE__ */ d.jsx("rect", { x: m.x - 5, y: m.y - 5, width: m.w + 10, height: m.h + 10, fill: yw }),
    /* @__PURE__ */ d.jsx("rect", { x: Math.min(S.x, T.x), y: Math.min(S.y, T.y), width: Math.abs(T.x - S.x) || m.w, height: Math.abs(T.y - S.y) || m.h, fill: "rgba(0,0,0,0.08)" }),
    /* @__PURE__ */ d.jsx("rect", { x: Math.min(_.x, R.x), y: Math.min(_.y, R.y), width: Math.abs(R.x - _.x) || m.w, height: Math.abs(R.y - _.y) || m.h, fill: "rgba(0,0,0,0.08)" }),
    /* @__PURE__ */ d.jsx("rect", { x: m.x, y: m.y, width: m.w, height: m.h, fill: "none", stroke: Hs, strokeWidth: 0.3 }),
    c.map((I) => u(I)),
    g.map((I) => u(I, !0)),
    w.flatMap((I) => x.map((Z) => b(I, Z))),
    [i, a].flatMap((I) => [k(0, I), k(n, I)]),
    [i, a].map((I) => {
      const Z = l(n / 2 - 2.8, I), B = l(n / 2 + 2.8, I);
      return /* @__PURE__ */ d.jsx("line", { x1: Z.x, y1: Z.y, x2: B.x, y2: B.y, stroke: "#f5f5f5", strokeWidth: 0.6, strokeLinecap: "round" }, `post${I}`);
    })
  ] });
}
const gw = {
  neutral1: "var(--tb-neutral1, #f59e0b)",
  neutral2: "var(--tb-neutral2, #111827)",
  neutral3: "var(--tb-neutral3, #f9fafb)",
  ball: "var(--tb-ball, #fef3c7)"
}, vw = {
  neutral1: "#f59e0b",
  neutral2: "#111827",
  neutral3: "#f9fafb",
  ball: "#fef3c7"
};
function Xc(e, t) {
  return e === "teamA" ? t.teamA : e === "teamB" ? t.teamB : gw[e];
}
function xw(e, t) {
  return e === "teamA" ? t.teamA : e === "teamB" ? t.teamB : vw[e];
}
function ww(e) {
  const t = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(e);
  if (!t) return "#fff";
  const [n, r, o] = [t[1], t[2], t[3]].map((i) => parseInt(i, 16));
  return (0.299 * n + 0.587 * r + 0.114 * o) / 255 > 0.6 ? "#111" : "#fff";
}
const io = "var(--tb-selection, #fbbf24)", kw = "var(--tb-guide, rgba(251,191,36,0.85))", Sw = 1.6, bw = 0.9, _w = 0.9, Cw = 2.4, Ew = 1.5;
function jw(e) {
  return e === "player" ? Sw : e === "ball" ? bw : _w;
}
function Zy({ object: e, position: t, z: n = 0, selected: r, dragging: o, colours: s, warning: i, onPointerDown: a }) {
  const l = Xc(e.colour, s), u = jw(e.type), c = r ? /* @__PURE__ */ d.jsx("circle", { r: u + 0.6, fill: "none", stroke: io, strokeWidth: 0.35 }) : i ? /* @__PURE__ */ d.jsx("circle", { r: u + 0.45, fill: "none", stroke: "#ef4444", strokeWidth: 0.25, strokeDasharray: "0.6 0.4" }) : null;
  return /* @__PURE__ */ d.jsxs(
    "g",
    {
      "data-object-id": e.id,
      "data-object-type": e.type,
      "data-selected": r ? "true" : void 0,
      transform: `translate(${t.x} ${t.y})`,
      onPointerDown: a,
      style: { cursor: o ? "grabbing" : "grab", touchAction: "none" },
      children: [
        /* @__PURE__ */ d.jsx("circle", { r: e.type === "player" ? Cw : Ew, fill: "transparent" }),
        c,
        e.type === "player" && /* @__PURE__ */ d.jsxs(d.Fragment, { children: [
          /* @__PURE__ */ d.jsx("circle", { r: u, fill: l, stroke: "rgba(0,0,0,0.55)", strokeWidth: 0.2 }),
          /* @__PURE__ */ d.jsx("text", { x: 0, y: 0.05, textAnchor: "middle", dominantBaseline: "middle", fontSize: 1.7, fontWeight: 700, fontFamily: "system-ui, sans-serif", fill: ww(xw(e.colour, s)), style: { userSelect: "none", pointerEvents: "none" }, children: e.number }),
          e.label && /* @__PURE__ */ d.jsx("text", { x: 0, y: u + 1.3, textAnchor: "middle", fontSize: 1.1, fontFamily: "system-ui, sans-serif", fill: "#fff", stroke: "rgba(0,0,0,0.6)", strokeWidth: 0.18, paintOrder: "stroke", style: { pointerEvents: "none", userSelect: "none" }, children: e.label })
        ] }),
        e.type === "ball" && /* @__PURE__ */ d.jsxs(d.Fragment, { children: [
          n > 0 && /* @__PURE__ */ d.jsx("ellipse", { "data-testid": "ball-shadow", rx: u * 1.25 * (1 + n * 0.6), ry: u * 0.8 * (1 + n * 0.6), fill: "rgba(0,0,0,0.35)" }),
          /* @__PURE__ */ d.jsxs("g", { "data-ball-z": n.toFixed(3), transform: `translate(0 ${-n * 6}) scale(${1 + n * 0.9})`, children: [
            /* @__PURE__ */ d.jsx("ellipse", { rx: u * 1.25, ry: u * 0.8, fill: l, stroke: "rgba(0,0,0,0.7)", strokeWidth: 0.18 }),
            /* @__PURE__ */ d.jsx("line", { x1: -u * 0.6, y1: 0, x2: u * 0.6, y2: 0, stroke: "rgba(0,0,0,0.5)", strokeWidth: 0.12 })
          ] })
        ] }),
        e.type === "cone" && /* @__PURE__ */ d.jsxs(d.Fragment, { children: [
          /* @__PURE__ */ d.jsx("polygon", { points: `0,${-u * 1.1} ${u},${u * 0.7} ${-u},${u * 0.7}`, fill: l, stroke: "rgba(0,0,0,0.6)", strokeWidth: 0.15, strokeLinejoin: "round" }),
          /* @__PURE__ */ d.jsx("rect", { x: -u * 1.1, y: u * 0.55, width: u * 2.2, height: 0.3, fill: "rgba(0,0,0,0.5)" })
        ] })
      ]
    }
  );
}
const $w = ["teamA", "teamB"], Iw = ["neutral1", "neutral2", "neutral3"], Tw = ["teamA", "teamB", "ball", "neutral3", "neutral1"], Nw = { run: "Run", pass: "Pass", kick: "Kick", arrow: "Arrow", defence: "Defence", zone: "Zone", sketch: "Sketch", text: "Text" };
function Ow({ board: e, selectedObjects: t, selectedDrawings: n, onPatch: r, onDrawingPatch: o, onToggleCurve: s, onDetach: i, onDelete: a, onDuplicate: l }) {
  const u = t.length + n.length;
  if (u === 0) return null;
  const c = u === 1, p = c ? t[0] : void 0, g = c ? n[0] : void 0, w = p?.type === "player" && Ry(e, p.id).length > 0, x = (b, v, f, m) => /* @__PURE__ */ d.jsx(
    "button",
    {
      type: "button",
      title: m,
      "aria-label": m,
      "aria-pressed": v,
      onClick: f,
      style: {
        width: 30,
        height: 30,
        borderRadius: 15,
        padding: 0,
        background: Xc(b, e.teamColours),
        border: v ? "3px solid var(--tb-selection, #fbbf24)" : "2px solid rgba(255,255,255,0.35)"
      }
    },
    b
  ), k = { display: "flex", alignItems: "center", gap: 4, fontFamily: "system-ui", fontSize: 13 };
  return /* @__PURE__ */ d.jsxs("div", { role: "group", "aria-label": "Selection", "data-testid": "context-bar", style: { display: "flex", gap: 10, alignItems: "center", padding: "6px 8px", flexWrap: "wrap", borderTop: "1px solid #374151" }, children: [
    /* @__PURE__ */ d.jsx("span", { style: { fontFamily: "system-ui", fontSize: 13, opacity: 0.8, minWidth: 70 }, children: p ? p.type === "player" ? "Player" : p.type === "ball" ? "Ball" : "Cone" : g ? Nw[g.type] : `${u} selected` }),
    p?.type === "player" && /* @__PURE__ */ d.jsxs(d.Fragment, { children: [
      /* @__PURE__ */ d.jsxs("label", { style: k, children: [
        "No.",
        /* @__PURE__ */ d.jsx(
          "input",
          {
            "aria-label": "Number",
            value: p.number,
            maxLength: 2,
            inputMode: "numeric",
            onChange: (b) => {
              const v = b.target.value.toUpperCase();
              G1(v) && r(p.id, { number: v });
            },
            style: { width: 44, textAlign: "center", borderColor: w ? "#ef4444" : void 0 }
          }
        ),
        w && /* @__PURE__ */ d.jsx("span", { title: "Another player on this team has this number", style: { color: "#ef4444", fontSize: 12 }, children: "dup" })
      ] }),
      /* @__PURE__ */ d.jsxs("label", { style: k, children: [
        "Label",
        /* @__PURE__ */ d.jsx("input", { "aria-label": "Label", value: p.label, maxLength: 24, placeholder: "name / position", onChange: (b) => r(p.id, { label: b.target.value }), style: { width: 120 } })
      ] }),
      /* @__PURE__ */ d.jsx("span", { style: { display: "flex", gap: 4 }, "aria-label": "Team", children: $w.map((b) => x(b, p.colour === b, () => r(p.id, { colour: b }), b === "teamA" ? "Team A" : "Team B")) })
    ] }),
    p?.type === "cone" && /* @__PURE__ */ d.jsx("span", { style: { display: "flex", gap: 4 }, "aria-label": "Cone colour", children: Iw.map((b) => x(b, p.colour === b, () => r(p.id, { colour: b }), `Cone ${b}`)) }),
    p?.type === "ball" && /* @__PURE__ */ d.jsx("span", { style: { fontFamily: "system-ui", fontSize: 12, opacity: 0.7 }, children: "Drag to move · position is per step" }),
    g && /* @__PURE__ */ d.jsxs(d.Fragment, { children: [
      /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": g.control ? "Straighten" : "Curve", "aria-pressed": !!g.control, onClick: () => s(g.id), title: "Toggle a curve handle", children: g.control ? "↔ Straighten" : "⤷ Curve" }),
      g.type === "kick" && /* @__PURE__ */ d.jsxs("label", { style: k, children: [
        "Height",
        /* @__PURE__ */ d.jsx(
          "input",
          {
            "aria-label": "Arc height",
            type: "range",
            min: 0,
            max: 1,
            step: 0.05,
            value: g.arcHeight ?? 0.5,
            onChange: (b) => o(g.id, { arcHeight: Number(b.target.value) }),
            style: { width: 90 }
          }
        )
      ] }),
      (g.type === "run" || g.type === "arrow" || g.type === "defence") && /* @__PURE__ */ d.jsxs("label", { style: k, children: [
        "Style",
        /* @__PURE__ */ d.jsxs("select", { "aria-label": "Drawing type", value: g.type, onChange: (b) => o(g.id, { type: b.target.value }), children: [
          /* @__PURE__ */ d.jsx("option", { value: "run", children: "Run" }),
          /* @__PURE__ */ d.jsx("option", { value: "arrow", children: "Arrow" }),
          /* @__PURE__ */ d.jsx("option", { value: "defence", children: "Defence" })
        ] })
      ] }),
      /* @__PURE__ */ d.jsx("span", { style: { display: "flex", gap: 4 }, "aria-label": "Line colour", children: Tw.map((b) => x(b, g.colour === b, () => o(g.id, { colour: b }), `Line ${b}`)) }),
      (g.fromObjectId || g.toObjectId) && /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Detach", title: "Detach from players", onClick: () => i(g.id), children: "⛓ Detach" })
    ] }),
    /* @__PURE__ */ d.jsxs("span", { style: { marginLeft: "auto", display: "flex", gap: 6 }, children: [
      /* @__PURE__ */ d.jsx("button", { type: "button", onClick: l, "aria-label": "Duplicate", children: "⧉ Duplicate" }),
      /* @__PURE__ */ d.jsx("button", { type: "button", onClick: a, "aria-label": "Delete", children: "🗑 Delete" })
    ] })
  ] });
}
const Pw = [
  { value: "full", label: "Full pitch" },
  { value: "half", label: "Half pitch" },
  { value: "twentyTwo", label: "22 area" },
  { value: "grid", label: "Grid" }
], Qy = [
  { tool: "select", label: "Select", icon: "⬚", key: "V", title: "Select / move / pan (V)", group: "select" },
  { tool: "playerA", label: "Player A", icon: "●", key: "A", title: "Tap to place a Team A player (A)", group: "objects" },
  { tool: "playerB", label: "Player B", icon: "●", key: "B", title: "Tap to place a Team B player (B)", group: "objects" },
  { tool: "ball", label: "Ball", icon: "⬬", key: "O", title: "Tap to place the ball (O)", group: "objects" },
  { tool: "cone", label: "Cone", icon: "▲", key: "C", title: "Tap to place a cone (C)", group: "objects" },
  { tool: "run", label: "Run", icon: "➔", key: "R", title: "Drag from a player to draw a run (R)", group: "tactics" },
  { tool: "pass", label: "Pass", icon: "⇢", key: "P", title: "Drag from a player to a player to draw a pass (P)", group: "tactics" },
  { tool: "kick", label: "Kick", icon: "⤴", key: "K", title: "Drag from the kicker to the landing point (K)", group: "tactics" },
  { tool: "arrow", label: "Arrow", icon: "→", key: "W", title: "Drag to draw a general arrow (W)", group: "tactics" },
  { tool: "defence", label: "Defence", icon: "⫿", key: "D", title: "Drag to draw a defensive movement (D)", group: "tactics" }
];
function Mw(e) {
  const t = (r) => r === "playerA" ? e.board.teamColours.teamA : r === "playerB" || r === "defence" ? e.board.teamColours.teamB : void 0, n = (r) => /* @__PURE__ */ d.jsxs("span", { className: "tb-group", role: "radiogroup", "aria-label": r === "select" ? "Select" : r === "objects" ? "Objects" : "Tactics", children: [
    r !== "select" && /* @__PURE__ */ d.jsx("span", { className: "tb-group-label", "aria-hidden": "true", children: r === "objects" ? "Objects" : "Tactics" }),
    Qy.filter((o) => o.group === r).map((o) => /* @__PURE__ */ d.jsxs("button", { type: "button", role: "radio", className: "tb-tool", "aria-checked": e.tool === o.tool, "aria-label": o.label, title: o.title, onClick: () => e.onTool(o.tool), children: [
      /* @__PURE__ */ d.jsx("span", { className: "tb-icon", "aria-hidden": "true", style: { color: t(o.tool) }, children: o.icon }),
      /* @__PURE__ */ d.jsx("span", { className: "tb-label", children: o.label })
    ] }, o.tool))
  ] });
  return /* @__PURE__ */ d.jsxs("div", { role: "toolbar", "aria-label": "Editor", className: "tb-rail", children: [
    /* @__PURE__ */ d.jsxs("span", { className: "tb-group", children: [
      /* @__PURE__ */ d.jsx("button", { type: "button", onClick: e.onUndo, disabled: !e.canUndo, "aria-label": "Undo", title: "Undo (⌘Z)", children: "↶" }),
      /* @__PURE__ */ d.jsx("button", { type: "button", onClick: e.onRedo, disabled: !e.canRedo, "aria-label": "Redo", title: "Redo (⇧⌘Z)", children: "↷" })
    ] }),
    /* @__PURE__ */ d.jsx("span", { className: "tb-sep" }),
    n("select"),
    /* @__PURE__ */ d.jsx("span", { className: "tb-sep" }),
    n("objects"),
    /* @__PURE__ */ d.jsx("span", { className: "tb-sep" }),
    n("tactics"),
    /* @__PURE__ */ d.jsx("span", { className: "tb-sep" }),
    /* @__PURE__ */ d.jsxs("span", { className: "tb-group", children: [
      /* @__PURE__ */ d.jsx("select", { "aria-label": "Pitch view", value: e.board.pitch.preset, onChange: (r) => e.onPreset(r.target.value), children: Pw.map((r) => /* @__PURE__ */ d.jsx("option", { value: r.value, children: r.label }, r.value)) }),
      /* @__PURE__ */ d.jsxs("button", { type: "button", "aria-label": "Rotate pitch", title: "Rotate pitch", onClick: () => e.onOrientation(e.board.pitch.orientation === "portrait" ? "landscape" : "portrait"), children: [
        "⟳ ",
        /* @__PURE__ */ d.jsx("span", { className: "tb-label", children: e.board.pitch.orientation === "portrait" ? "Portrait" : "Landscape" })
      ] })
    ] }),
    /* @__PURE__ */ d.jsx("span", { className: "tb-sep" }),
    /* @__PURE__ */ d.jsxs("span", { className: "tb-group", "aria-label": "Zoom", children: [
      /* @__PURE__ */ d.jsx("button", { type: "button", onClick: () => e.onZoom(1 / 1.25), "aria-label": "Zoom out", children: "−" }),
      /* @__PURE__ */ d.jsxs("button", { type: "button", onClick: e.onResetView, "aria-label": "Reset view", title: "Reset zoom/pan", style: { minWidth: 52 }, children: [
        Math.round(e.zoom * 100),
        "%"
      ] }),
      /* @__PURE__ */ d.jsx("button", { type: "button", onClick: () => e.onZoom(1.25), "aria-label": "Zoom in", children: "+" })
    ] }),
    /* @__PURE__ */ d.jsx("span", { className: "tb-sep" }),
    /* @__PURE__ */ d.jsxs("button", { type: "button", "aria-label": "Select many", "aria-pressed": e.multiSelectMode, onClick: () => e.onMultiSelectMode(!e.multiSelectMode), style: { borderColor: e.multiSelectMode ? "var(--tb-selection)" : void 0 }, children: [
      "☐ ",
      /* @__PURE__ */ d.jsx("span", { className: "tb-label", children: "Select many" })
    ] })
  ] });
}
const Rw = 3;
function Dw(e, t) {
  const n = Vt(e.start, t), r = Vt(e.end, t);
  if (!e.control) return `M ${n.x} ${n.y} L ${r.x} ${r.y}`;
  const o = Vt(e.control, t);
  return `M ${n.x} ${n.y} Q ${o.x} ${o.y} ${r.x} ${r.y}`;
}
function zw(e, t) {
  const n = Xc(e.colour, t);
  switch (e.type) {
    case "run":
      return { stroke: n, width: 0.55, dash: void 0, opacity: 1, head: "filled", headSize: 1.8 };
    case "pass":
      return { stroke: n, width: 0.35, dash: "1.2 0.9", opacity: 1, head: "open", headSize: 1.4 };
    case "kick":
      return { stroke: n, width: 0.45, dash: "0.3 0.9", opacity: 1, head: "filled", headSize: 1.8 };
    case "defence":
      return { stroke: n, width: 1.4, dash: void 0, opacity: 0.55, head: "bar", headSize: 2.6 };
    case "arrow":
    default:
      return { stroke: n, width: 0.3, dash: void 0, opacity: 0.95, head: "open", headSize: 1.4 };
  }
}
function Aw(e, t, n, r, o, s) {
  const i = Vt(e.end, t), a = Vt(Yc(e, 0.97), t);
  let l = i.x - a.x, u = i.y - a.y;
  const c = Math.hypot(l, u) || 1;
  l /= c, u /= c;
  const p = -u, g = l;
  if (n === "bar") {
    const v = r / 2;
    return /* @__PURE__ */ d.jsx("line", { x1: i.x - p * v, y1: i.y - g * v, x2: i.x + p * v, y2: i.y + g * v, stroke: o, strokeWidth: s * 0.5, strokeLinecap: "round" });
  }
  const w = i.x - l * r, x = i.y - u * r, k = r * 0.55, b = `${i.x},${i.y} ${w + p * k},${x + g * k} ${w - p * k},${x - g * k}`;
  return n === "filled" ? /* @__PURE__ */ d.jsx("polygon", { points: b, fill: o }) : /* @__PURE__ */ d.jsx("polyline", { points: `${w + p * k},${x + g * k} ${i.x},${i.y} ${w - p * k},${x - g * k}`, fill: "none", stroke: o, strokeWidth: s, strokeLinejoin: "round", strokeLinecap: "round" });
}
function Lu({ drawing: e, path: t, frame: n, colours: r, selected: o, zoom: s, onPointerDown: i }) {
  const a = zw(e, r), l = Dw(t, n), u = Vt(Yc(t, 0.5), n), c = L1(t, 0.5), p = (() => {
    const g = Vt({ x: 0, y: 0 }, n), w = Vt(c, n);
    return { x: w.x - g.x, y: w.y - g.y };
  })();
  return /* @__PURE__ */ d.jsxs(
    "g",
    {
      "data-drawing-id": e.id,
      "data-drawing-type": e.type,
      "data-selected": o ? "true" : void 0,
      onPointerDown: i,
      style: { cursor: i ? "pointer" : void 0, touchAction: "none" },
      children: [
        i && /* @__PURE__ */ d.jsx("path", { d: l, fill: "none", stroke: "transparent", strokeWidth: Math.max(Rw / s, 1.5), pointerEvents: "stroke" }),
        o && /* @__PURE__ */ d.jsx("path", { d: l, fill: "none", stroke: io, strokeWidth: a.width + 0.9, strokeLinecap: "round", opacity: 0.6, pointerEvents: "none" }),
        e.type === "defence" && /* @__PURE__ */ d.jsx("path", { d: l, fill: "none", stroke: "rgba(0,0,0,0.35)", strokeWidth: a.width + 0.4, strokeLinecap: "round", pointerEvents: "none" }),
        /* @__PURE__ */ d.jsx("path", { d: l, fill: "none", stroke: a.stroke, strokeWidth: a.width, strokeDasharray: a.dash, strokeLinecap: "round", opacity: a.opacity, pointerEvents: "none" }),
        Aw(t, n, a.head, a.headSize, a.stroke, a.width),
        e.type === "kick" && e.arcHeight !== void 0 && // Arc-height indicator: a small "lob" glyph perpendicular to travel, sized by arcHeight.
        /* @__PURE__ */ d.jsx("g", { transform: `translate(${u.x} ${u.y}) rotate(${Math.atan2(p.y, p.x) * 180 / Math.PI})`, pointerEvents: "none", children: /* @__PURE__ */ d.jsx("path", { d: `M -1.6 0 Q 0 ${-(1 + 3.5 * e.arcHeight)} 1.6 0`, fill: "none", stroke: a.stroke, strokeWidth: 0.3 }) })
      ]
    }
  );
}
function kl({ at: e, kind: t, zoom: n, onPointerDown: r }) {
  const o = Math.max(1.1 / n, 0.6);
  return /* @__PURE__ */ d.jsxs("g", { "data-handle": t, transform: `translate(${e.x} ${e.y})`, onPointerDown: r, style: { cursor: "move", touchAction: "none" }, children: [
    /* @__PURE__ */ d.jsx("circle", { r: o * 2.2, fill: "transparent" }),
    t === "control" ? /* @__PURE__ */ d.jsx("rect", { x: -o, y: -o, width: 2 * o, height: 2 * o, fill: "#fff", stroke: io, strokeWidth: 0.25 / n, transform: "rotate(45)" }) : /* @__PURE__ */ d.jsx("circle", { r: o, fill: "#fff", stroke: io, strokeWidth: 0.3 / n })
  ] });
}
const ip = { minWidth: 40, height: 36, padding: "0 10px", borderRadius: 8, fontFamily: "system-ui", fontSize: 13 };
function Lw(e) {
  const t = e.board.steps.length, n = e.board.steps[e.currentStep], r = n ? (n.durationMs / 1e3).toFixed(1) : "1.5";
  return /* @__PURE__ */ d.jsxs("div", { "data-testid": "step-strip", style: { display: "flex", flexDirection: "column", gap: 6, padding: "6px 8px", borderTop: "1px solid #374151" }, children: [
    /* @__PURE__ */ d.jsxs("div", { role: "tablist", "aria-label": "Steps", style: { display: "flex", gap: 6, alignItems: "center", overflowX: "auto", paddingBottom: 2 }, children: [
      e.board.steps.map((o, s) => {
        const i = s === e.currentStep, a = e.playingStep === s;
        return /* @__PURE__ */ d.jsxs(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": i,
            "aria-label": `Step ${s + 1}${o.label ? `: ${o.label}` : ""}`,
            "data-testid": `step-tab-${s}`,
            onClick: () => e.onSelect(s),
            draggable: !e.readOnly,
            onDragStart: (l) => l.dataTransfer.setData("text/step-index", String(s)),
            onDragOver: (l) => l.preventDefault(),
            onDrop: (l) => {
              l.preventDefault();
              const u = Number(l.dataTransfer.getData("text/step-index"));
              !e.readOnly && Number.isInteger(u) && u !== s && e.onMove(u, s);
            },
            style: {
              ...ip,
              fontWeight: i ? 700 : 400,
              borderColor: i ? "var(--tb-selection, #fbbf24)" : a ? "#60a5fa" : void 0,
              background: i ? "rgba(251,191,36,0.18)" : a ? "rgba(96,165,250,0.18)" : void 0,
              whiteSpace: "nowrap"
            },
            children: [
              s + 1,
              o.label ? /* @__PURE__ */ d.jsx("span", { style: { opacity: 0.8, marginLeft: 6, fontWeight: 400 }, children: o.label }) : null
            ]
          },
          o.id
        );
      }),
      !e.readOnly && /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Add step", title: "Add a step after the current one (inherits positions)", onClick: e.onAdd, style: { ...ip, minWidth: 36 }, children: "+" })
    ] }),
    n && e.readOnly && n.note && /* @__PURE__ */ d.jsx("div", { style: { fontFamily: "system-ui", fontSize: 13, opacity: 0.85 }, children: n.note }),
    n && !e.readOnly && /* @__PURE__ */ d.jsxs("div", { role: "group", "aria-label": "Step settings", style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontFamily: "system-ui", fontSize: 13 }, children: [
      /* @__PURE__ */ d.jsxs("span", { style: { opacity: 0.7, minWidth: 54 }, children: [
        "Step ",
        e.currentStep + 1
      ] }),
      /* @__PURE__ */ d.jsx("input", { "aria-label": "Step label", placeholder: "label", value: n.label, maxLength: 24, onChange: (o) => e.onLabel(e.currentStep, o.target.value), style: { width: 110 } }),
      /* @__PURE__ */ d.jsx("input", { "aria-label": "Step note", placeholder: "coaching note for this step", value: n.note, onChange: (o) => e.onNote(e.currentStep, o.target.value), style: { flex: "1 1 180px", minWidth: 140 } }),
      /* @__PURE__ */ d.jsxs("label", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
        "Duration",
        /* @__PURE__ */ d.jsx(
          "input",
          {
            "aria-label": "Step duration",
            type: "number",
            min: 0.2,
            max: 10,
            step: 0.1,
            value: r,
            onChange: (o) => {
              const s = Number(o.target.value);
              Number.isFinite(s) && s >= 0.2 && s <= 10 && e.onDuration(e.currentStep, Math.round(s * 1e3));
            },
            style: { width: 60 }
          }
        ),
        "s"
      ] }),
      /* @__PURE__ */ d.jsxs("span", { style: { display: "flex", gap: 4, marginLeft: "auto" }, children: [
        /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Move step earlier", disabled: e.currentStep === 0, onClick: () => e.onMove(e.currentStep, e.currentStep - 1), children: "◀" }),
        /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Move step later", disabled: e.currentStep >= t - 1, onClick: () => e.onMove(e.currentStep, e.currentStep + 1), children: "▶" }),
        /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Insert step before", title: "Insert a step before this one", onClick: () => e.onInsertBefore(e.currentStep), children: "⇤ Insert" }),
        /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Duplicate step", onClick: () => e.onDuplicate(e.currentStep), children: "⧉ Duplicate" }),
        /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Delete step", disabled: t <= 1, onClick: () => e.onDelete(e.currentStep), children: "🗑 Delete" })
      ] })
    ] })
  ] });
}
const Zs = { minWidth: 44, height: 40, fontSize: 16 };
function Fw(e) {
  const t = ks(e.board), n = t > 0 ? e.playback.elapsedMs / t : 0, r = Au(e.board, e.playback), o = e.board.steps[r];
  return /* @__PURE__ */ d.jsxs("div", { "data-testid": "playback-bar", style: { display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderTop: "1px solid #374151", flexWrap: "wrap", fontFamily: "system-ui" }, children: [
    /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Restart", title: "Restart", onClick: e.onRestart, style: Zs, children: "⏮" }),
    /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Previous step", title: "Previous step (←)", onClick: e.onPrev, style: Zs, children: "◀" }),
    /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": e.playback.playing ? "Pause" : "Play", "aria-pressed": e.playback.playing, title: "Play/Pause (space)", onClick: e.onPlayPause, disabled: t <= 0, style: { ...Zs, minWidth: 64, fontWeight: 700 }, children: e.playback.playing ? "❚❚" : "▶" }),
    /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Next step", title: "Next step (→)", onClick: e.onNext, style: Zs, children: "▶|" }),
    /* @__PURE__ */ d.jsx(
      "input",
      {
        "aria-label": "Scrub",
        type: "range",
        min: 0,
        max: 1e3,
        step: 1,
        value: Math.round(n * 1e3),
        disabled: t <= 0,
        onChange: (s) => e.onScrub(Number(s.target.value) / 1e3),
        style: { flex: "1 1 160px", minWidth: 120, height: 32 }
      }
    ),
    /* @__PURE__ */ d.jsxs("span", { "data-testid": "playback-status", style: { fontSize: 13, minWidth: 110, whiteSpace: "nowrap" }, children: [
      "Step ",
      r + 1,
      "/",
      e.board.steps.length,
      " · ",
      (e.playback.elapsedMs / 1e3).toFixed(1),
      "s / ",
      (t / 1e3).toFixed(1),
      "s"
    ] }),
    !e.compact && /* @__PURE__ */ d.jsxs(d.Fragment, { children: [
      /* @__PURE__ */ d.jsxs("label", { style: { fontSize: 13, display: "flex", gap: 4, alignItems: "center" }, children: [
        /* @__PURE__ */ d.jsx("input", { type: "checkbox", "aria-label": "Loop", checked: e.playback.loop, onChange: (s) => e.onLoop(s.target.checked) }),
        " Loop"
      ] }),
      /* @__PURE__ */ d.jsxs("select", { "aria-label": "Easing", value: e.easing, onChange: (s) => e.onEasing(s.target.value), children: [
        /* @__PURE__ */ d.jsx("option", { value: "easeInOut", children: "Ease in/out" }),
        /* @__PURE__ */ d.jsx("option", { value: "linear", children: "Linear" })
      ] }),
      e.onPresent && /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Present", title: "Present mode", onClick: e.onPresent, style: { marginLeft: "auto" }, children: "▣ Present" })
    ] }),
    o?.note && !e.compact && /* @__PURE__ */ d.jsx("span", { "data-testid": "playback-note", style: { flexBasis: "100%", fontSize: 13, opacity: 0.85 }, children: o.note })
  ] });
}
const Bw = { saved: "Saved", saving: "Saving…", error: "Not saved", idle: "" };
function Vw(e) {
  const [t, n] = $.useState(e.board.metadata.name), [r, o] = $.useState(null), s = $.useRef(null), i = $.useRef(null);
  $.useEffect(() => n(e.board.metadata.name), [e.board.metadata.name]), $.useEffect(() => {
    if (!r) return;
    const u = (c) => {
      const p = c.target;
      !s.current?.contains(p) && !i.current?.contains(p) && o(null);
    };
    return document.addEventListener("mousedown", u), () => document.removeEventListener("mousedown", u);
  }, [r]);
  const a = () => {
    t.trim() && t.trim() !== e.board.metadata.name ? e.onRename(t.trim()) : n(e.board.metadata.name);
  }, l = e.board.metadata.favourite;
  return /* @__PURE__ */ d.jsxs("div", { className: "tb-bar", "data-testid": "board-bar", children: [
    e.onBack && /* @__PURE__ */ d.jsxs("button", { type: "button", "aria-label": `Back to ${e.backLabel ?? "library"}`, title: `Back to ${e.backLabel ?? "library"}`, onClick: e.onBack, children: [
      "← ",
      /* @__PURE__ */ d.jsx("span", { className: "tb-label", children: e.backLabel ?? "Library" })
    ] }),
    e.readOnly ? /* @__PURE__ */ d.jsx("span", { className: "tb-name", "data-testid": "board-name-readonly", style: { display: "flex", alignItems: "center", fontWeight: 700, fontSize: 16 }, children: e.board.metadata.name }) : /* @__PURE__ */ d.jsx(
      "input",
      {
        className: "tb-name",
        "aria-label": "Board name",
        value: t,
        maxLength: 60,
        onChange: (u) => n(u.target.value),
        onBlur: a,
        onKeyDown: (u) => {
          u.key === "Enter" && u.target.blur(), u.key === "Escape" && (n(e.board.metadata.name), u.target.blur());
        }
      }
    ),
    !e.readOnly && /* @__PURE__ */ d.jsxs("select", { "aria-label": "Board type", value: e.board.metadata.kind, onChange: (u) => e.onKind(u.target.value), className: "tb-hide-narrow", children: [
      /* @__PURE__ */ d.jsx("option", { value: "tactic", children: "Tactic" }),
      /* @__PURE__ */ d.jsx("option", { value: "drill", children: "Drill" })
    ] }),
    /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": l ? "Unfavourite" : "Favourite", "aria-pressed": l, title: l ? "Remove from favourites" : "Add to favourites", onClick: () => e.onFavourite(!l), style: { color: l ? "var(--tb-selection)" : void 0 }, children: l ? "★" : "☆" }),
    /* @__PURE__ */ d.jsx("span", { className: "tb-status", role: "status", "aria-live": "polite", "data-testid": "save-status", children: e.readOnly ? "View only" : Bw[e.saveStatus] }),
    /* @__PURE__ */ d.jsxs("span", { style: { marginLeft: "auto", display: "flex", gap: 8 }, children: [
      e.actions && e.actions.length > 0 && /* @__PURE__ */ d.jsxs("div", { className: "tb-menu", ref: i, children: [
        /* @__PURE__ */ d.jsxs("button", { type: "button", "aria-label": "Share", "aria-haspopup": "menu", "aria-expanded": r === "share", onClick: () => o((u) => u === "share" ? null : "share"), children: [
          "↗ ",
          /* @__PURE__ */ d.jsx("span", { className: "tb-label", children: "Share" })
        ] }),
        r === "share" && /* @__PURE__ */ d.jsx("div", { role: "menu", className: "tb-menu-list", children: e.actions.map((u) => /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", onClick: () => {
          o(null), u.run();
        }, children: u.label }, u.id)) })
      ] }),
      /* @__PURE__ */ d.jsxs("div", { className: "tb-menu", ref: s, children: [
        /* @__PURE__ */ d.jsxs("button", { type: "button", "aria-label": "Export", "aria-haspopup": "menu", "aria-expanded": r === "export", onClick: () => o((u) => u === "export" ? null : "export"), children: [
          "⇩ ",
          /* @__PURE__ */ d.jsx("span", { className: "tb-label", children: "Export" })
        ] }),
        r === "export" && /* @__PURE__ */ d.jsxs("div", { role: "menu", className: "tb-menu-list", children: [
          /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", onClick: () => {
            o(null), e.onExport("png");
          }, children: "PNG image (this step)" }),
          /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", onClick: () => {
            o(null), e.onExport("json");
          }, children: "JSON (whole board)" })
        ] })
      ] }),
      /* @__PURE__ */ d.jsxs("button", { type: "button", "aria-label": "Present", title: "Present mode", onClick: e.onPresent, style: { borderColor: "var(--tb-selection)" }, children: [
        "▣ ",
        /* @__PURE__ */ d.jsx("span", { className: "tb-label", children: "Present" })
      ] })
    ] })
  ] });
}
function Uw(e) {
  const t = ks(e.board), n = t > 0 ? e.playback.elapsedMs / t : 0, r = e.board.steps.length;
  return /* @__PURE__ */ d.jsxs("div", { "data-testid": "present-controls", children: [
    /* @__PURE__ */ d.jsxs("div", { className: "tb-present-scrub", children: [
      /* @__PURE__ */ d.jsxs("span", { className: "tb-status", children: [
        (e.playback.elapsedMs / 1e3).toFixed(1),
        "s"
      ] }),
      /* @__PURE__ */ d.jsx("input", { "aria-label": "Scrub", type: "range", min: 0, max: 1e3, step: 1, value: Math.round(n * 1e3), disabled: t <= 0, onChange: (o) => e.onScrub(Number(o.target.value) / 1e3) }),
      /* @__PURE__ */ d.jsxs("span", { className: "tb-status", children: [
        (t / 1e3).toFixed(1),
        "s"
      ] })
    ] }),
    /* @__PURE__ */ d.jsxs("div", { className: "tb-present-controls", children: [
      /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Restart", title: "Restart", onClick: e.onRestart, children: "⏮" }),
      /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Previous step", title: "Previous step (←)", onClick: e.onPrev, disabled: e.displayStep === 0 && e.playback.elapsedMs === 0, children: "◀" }),
      /* @__PURE__ */ d.jsx("button", { type: "button", className: "tb-play", "aria-label": e.playback.playing ? "Pause" : "Play", "aria-pressed": e.playback.playing, title: "Play/Pause (space)", onClick: e.onPlayPause, disabled: t <= 0, children: e.playback.playing ? "❚❚" : "▶" }),
      /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Next step", title: "Next step (→)", onClick: e.onNext, disabled: e.displayStep >= r - 1, children: "▶|" }),
      /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Loop", "aria-pressed": e.playback.loop, title: "Loop", onClick: () => e.onLoop(!e.playback.loop), style: { color: e.playback.loop ? "var(--tb-selection)" : void 0 }, children: "↻" }),
      /* @__PURE__ */ d.jsx("span", { className: "tb-dots", role: "tablist", "aria-label": "Steps", children: e.board.steps.map((o, s) => /* @__PURE__ */ d.jsx("button", { type: "button", role: "tab", className: "tb-dot", "aria-selected": s === e.displayStep, "aria-current": s === e.displayStep ? "step" : void 0, "aria-label": `Go to step ${s + 1}`, title: o.label || `Step ${s + 1}`, onClick: () => e.onSelectStep(s) }, o.id)) }),
      e.onFullscreen && /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Full screen", title: "Full screen", onClick: e.onFullscreen, children: "⛶" }),
      /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": "Exit present", title: "Exit (Esc)", onClick: e.onExit, children: "✕" })
    ] })
  ] });
}
const Ww = `
:root { --tb-selection: #fbbf24; --tb-bg: #1f2937; --tb-chrome: #111827; --tb-chrome-2: #1a2233; --tb-border: #374151; --tb-text: #e5e7eb; --tb-muted: #9ca3af; }
.tb-root, .tb-root * { box-sizing: border-box; }
.tb-root { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--tb-text); background: var(--tb-chrome); display: flex; flex-direction: column; height: 100%; min-height: 0; outline: none; overflow-y: auto; }
/* A host may style bare elements globally (Coach's Eye sets
   'input, select, textarea { width: 100% }'). The board must look the same in
   any host, so it states its own width rather than inheriting one. */
.tb-root input, .tb-root select, .tb-root textarea { width: auto; max-width: 100%; }
.tb-root button, .tb-root select, .tb-root input { font: inherit; color: var(--tb-text); background: var(--tb-chrome-2); border: 1px solid #4b5563; border-radius: 8px; min-height: 40px; padding: 0 12px; }
.tb-root input[type=range] { min-height: 0; padding: 0; background: transparent; border: 0; }
.tb-root input[type=checkbox] { min-height: 0; width: 18px; height: 18px; }
.tb-root button { cursor: pointer; }
.tb-root button:disabled { opacity: .4; cursor: default; }
.tb-root button:focus-visible, .tb-root input:focus-visible, .tb-root select:focus-visible { outline: 2px solid var(--tb-selection); outline-offset: 2px; }
.tb-bar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--tb-border); flex-wrap: wrap; }
.tb-rail { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--tb-border); overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
.tb-group { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.tb-group-label { font-size: 11px; color: var(--tb-muted); text-transform: uppercase; letter-spacing: .04em; margin: 0 4px 0 2px; }
.tb-sep { width: 1px; align-self: stretch; background: var(--tb-border); margin: 0 4px; flex: 0 0 auto; }
.tb-tool { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; min-width: 44px; justify-content: center; }
.tb-tool .tb-icon { font-size: 16px; line-height: 1; }
.tb-tool[aria-checked="true"] { border-color: var(--tb-selection); background: rgba(251,191,36,.18); font-weight: 700; }
.tb-strip-tab[aria-selected="true"] { border-color: var(--tb-selection); background: rgba(251,191,36,.18); font-weight: 700; }
.tb-name { font-weight: 700; font-size: 16px; min-width: 120px; max-width: 360px; flex: 1 1 200px; background: transparent; border-color: transparent; }
.tb-name:hover, .tb-name:focus { border-color: #4b5563; background: var(--tb-chrome-2); }
.tb-status { font-size: 12px; color: var(--tb-muted); white-space: nowrap; }
/* A floor for the pitch: embedded in a short host slot the chrome wraps and would otherwise squeeze the board to nothing — the chrome scrolls instead. */
.tb-canvas { flex: 1 1 0; min-height: 220px; display: flex; align-items: center; justify-content: center; background: var(--tb-bg); overflow: hidden; position: relative; }
.tb-present { background: #0b1220; }
.tb-present-head { display: flex; align-items: center; gap: 12px; padding: 8px 14px; }
.tb-present-title { font-size: 18px; font-weight: 700; }
.tb-present-step { font-size: 14px; color: var(--tb-muted); }
.tb-dots { display: flex; gap: 8px; align-items: center; }
.tb-present-controls .tb-dot, .tb-dot { width: 12px; height: 12px; min-width: 0; min-height: 0; border-radius: 6px; background: #4b5563; border: 0; padding: 0; font-size: 0; }
.tb-dots { padding: 0 8px; min-height: 52px; align-items: center; }
.tb-dot[aria-current="step"] { background: var(--tb-selection); transform: scale(1.3); }
.tb-present-note { position: absolute; left: 12px; right: 12px; bottom: 10px; padding: 10px 14px; border-radius: 10px; background: rgba(11,18,32,.82); color: #f9fafb; font-size: 18px; text-align: center; pointer-events: none; }
.tb-present-controls { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px 14px; flex-wrap: wrap; }
.tb-present-controls button { min-height: 52px; min-width: 56px; font-size: 20px; border-radius: 12px; }
.tb-present-controls .tb-play { min-width: 88px; font-weight: 700; background: var(--tb-selection); color: #111; border-color: var(--tb-selection); }
.tb-present-scrub { width: 100%; padding: 0 14px 10px; display: flex; align-items: center; gap: 10px; }
.tb-present-scrub input[type=range] { flex: 1; height: 36px; }
.tb-menu { position: relative; }
.tb-menu-list { position: absolute; right: 0; top: 100%; margin-top: 4px; background: var(--tb-chrome-2); border: 1px solid #4b5563; border-radius: 10px; padding: 6px; display: flex; flex-direction: column; gap: 4px; min-width: 160px; z-index: 20; box-shadow: 0 8px 24px rgba(0,0,0,.4); }
.tb-menu-list button { text-align: left; border-color: transparent; }
.tb-menu-list button:hover { border-color: #4b5563; }
@media (max-width: 720px) {
  .tb-tool .tb-label { display: none; }
  .tb-tool { min-width: 44px; padding: 0 10px; }
  .tb-group-label { display: none; }
  .tb-hide-narrow { display: none !important; }
  .tb-name { max-width: 160px; }
  .tb-present-note { font-size: 15px; }
}
@media (min-width: 721px) and (max-width: 1024px) {
  .tb-tool { padding: 0 10px; }
}
`;
let Sl = !1;
function Ky(e = typeof document < "u" ? document : void 0) {
  if (Sl || !e) return;
  if (e.getElementById("tb-editor-styles")) {
    Sl = !0;
    return;
  }
  const t = e.createElement("style");
  t.id = "tb-editor-styles", t.textContent = Ww, e.head.appendChild(t), Sl = !0;
}
const Hw = ["run", "pass", "kick", "arrow", "defence"], Zw = ["playerA", "playerB", "ball", "cone"];
function bl(e) {
  return Hw.includes(e);
}
function _l(e) {
  return Zw.includes(e);
}
const Fu = 0.5, Bu = 4, Qw = {
  tool: "select",
  selectedIds: [],
  multiSelectMode: !1,
  currentStep: 0,
  playhead: null,
  zoom: 1,
  pan: { x: 0, y: 0 },
  guides: [],
  presenting: !1
}, Kw = (e) => Math.min(Bu, Math.max(Fu, e));
function Yw(e, t) {
  switch (t.type) {
    case "select":
      return { ...e, selectedIds: t.ids };
    case "toggleSelect":
      return { ...e, selectedIds: e.selectedIds.includes(t.id) ? e.selectedIds.filter((n) => n !== t.id) : [...e.selectedIds, t.id] };
    case "clearSelection":
      return e.selectedIds.length ? { ...e, selectedIds: [] } : e;
    case "setMultiSelectMode":
      return { ...e, multiSelectMode: t.on };
    case "setStep":
      return { ...e, currentStep: t.index, playhead: null };
    case "setPlayhead":
      return { ...e, playhead: t.t };
    case "setTool":
      return e.tool === t.tool ? e : { ...e, tool: t.tool, selectedIds: t.tool === "select" ? e.selectedIds : [] };
    case "setView":
      return { ...e, zoom: Kw(t.zoom), pan: t.pan };
    case "resetView":
      return { ...e, zoom: 1, pan: { x: 0, y: 0 } };
    case "setPresenting":
      return { ...e, presenting: t.on, selectedIds: t.on ? [] : e.selectedIds, tool: t.on ? "select" : e.tool };
    case "setGuides":
      return t.guides.length === 0 && e.guides.length === 0 ? e : { ...e, guides: t.guides };
    case "pruneSelection": {
      const n = e.selectedIds.filter((r) => t.existingIds.includes(r));
      return n.length === e.selectedIds.length ? e : { ...e, selectedIds: n };
    }
  }
}
const Gw = 6, Xw = 2.5, Jw = 1.5, ap = { cone: 0, player: 1, ball: 2 }, lp = Object.fromEntries(Qy.map((e) => [e.key.toLowerCase(), e.tool]));
function Cl(e, t) {
  return e === "pass" || e === "run" ? !0 : e === "kick" ? t === "from" : !1;
}
function qw({ board: e, onChange: t, className: n, onBack: r, backLabel: o, saveStatus: s = "idle", readOnly: i = !1, actions: a, onExport: l, presentOnOpen: u = !1, onPresentChange: c }) {
  Ky();
  const [p, g] = $.useState(() => X1(e)), w = $.useRef(p);
  w.current = p;
  const [x, k] = $.useReducer(Yw, { ...Qw, presenting: u }), [b, v] = $.useState(null), [f, m] = $.useState(cw), [S, _] = $.useState(U1), [T, R] = $.useState(!1), I = $.useRef(null);
  I.current = b;
  const Z = $.useRef(/* @__PURE__ */ new Map()), B = $.useRef(null), _e = $.useRef(null), M = p.board, tt = $.useMemo(() => ({ viewport: M.pitch.viewport, orientation: M.pitch.orientation }), [M.pitch]), Jn = ja(tt), ve = Math.min(x.currentStep, M.steps.length - 1), ct = M.steps[ve], Cr = Ny[S], N = f.playing || T, V = N ? Vy(M, f) : ve, U = N ? Au(M, f) : ve;
  $.useEffect(() => {
    if (!f.playing) return;
    let h = 0, y = performance.now();
    const C = (A) => {
      const ee = A - y;
      y = A, m((K) => dw(M, K, ee)), h = requestAnimationFrame(C);
    };
    return h = requestAnimationFrame(C), () => cancelAnimationFrame(h);
  }, [f.playing, M]);
  const ae = $.useCallback(
    (h) => {
      m((y) => xl(M, vl(y), h)), R(!1), k({ type: "setStep", index: h });
    },
    [M]
  ), le = $.useCallback(() => {
    (f.playing || T) && ae(Au(M, f));
  }, [f, T, ae, M]), ue = $.useCallback(
    (h) => {
      le();
      const y = J1(w.current, h);
      w.current = y, g(y), t?.(y.board);
    },
    [t, le]
  ), Wt = $.useCallback(() => {
    le();
    const h = tw(w.current);
    h !== w.current && (w.current = h, g(h), t?.(h.board));
  }, [t, le]), Er = $.useCallback(() => {
    le();
    const h = nw(w.current);
    h !== w.current && (w.current = h, g(h), t?.(h.board));
  }, [t, le]), Ct = () => {
    if (f.playing) {
      m((y) => vl(y)), R(!0);
      return;
    }
    const h = T ? f : xl(M, f, ve);
    R(!0), m(fw(M, h));
  }, qn = () => {
    R(!0), m((h) => ({ ...xl(M, h, 0), playing: h.playing }));
  }, xd = (h) => {
    R(!0), m((y) => pw(M, y, h));
  }, Ss = () => ae(Math.max(0, (N ? Math.ceil(V) : ve) - 1)), bs = () => ae(Math.min(M.steps.length - 1, Math.floor(V) + 1)), wd = (h) => ae(h);
  $.useEffect(() => {
    k({ type: "pruneSelection", existingIds: [...M.objects.map((h) => h.id), ...ct.drawings.map((h) => h.id)] });
  }, [M.objects, ct.drawings]), $.useEffect(() => {
    x.currentStep > M.steps.length - 1 && k({ type: "setStep", index: M.steps.length - 1 });
  }, [M.steps.length, x.currentStep]);
  const Ht = $.useCallback((h, y) => {
    const C = B.current, A = C?.getScreenCTM();
    if (!C || !A) return { x: 0, y: 0 };
    const ee = new DOMPoint(h, y).matrixTransform(A.inverse());
    return { x: ee.x, y: ee.y };
  }, []), po = $.useCallback(
    (h, y) => {
      const C = Ht(h, y), A = { x: (C.x - x.pan.x) / x.zoom, y: (C.y - x.pan.y) / x.zoom };
      return P1(A, tt);
    },
    [Ht, tt, x.pan, x.zoom]
  ), He = $.useCallback((h) => Vt(h, tt), [tt]), Pe = $.useMemo(() => Gc(M, V, Cr), [M, V, Cr]), _s = $.useMemo(() => new Set(x.selectedIds), [x.selectedIds]), Cs = $.useMemo(() => x.selectedIds.map((h) => M.objects.find((y) => y.id === h)).filter((h) => !!h), [x.selectedIds, M.objects]), ho = $.useMemo(() => x.selectedIds.map((h) => ct.drawings.find((y) => y.id === h)).filter((h) => !!h), [x.selectedIds, ct.drawings]), kd = $.useMemo(() => new Set(M.objects.map((h) => h.id)), [M.objects]), Hg = M.steps[U]?.drawings ?? [], Rt = b?.kind === "move" ? { x: b.position.x - b.start.x, y: b.position.y - b.start.y } : null, Sd = $.useMemo(() => {
    if (!Rt || b?.kind !== "move") return Pe;
    const h = { ...Pe };
    for (const y of b.objectIds) {
      const C = Pe[y];
      C && (h[y] = { x: C.x + Rt.x, y: C.y + Rt.y });
    }
    return h;
  }, [Pe, b, Rt]), bd = (h) => {
    const y = On(h, Sd);
    if (b?.kind === "move" && Rt && b.drawingIds.includes(h.id)) {
      const C = { start: { x: y.start.x + Rt.x, y: y.start.y + Rt.y }, end: { x: y.end.x + Rt.x, y: y.end.y + Rt.y } };
      return y.control && (C.control = { x: y.control.x + Rt.x, y: y.control.y + Rt.y }), C;
    }
    if (b?.kind === "handle" && b.drawingId === h.id) {
      const C = { ...y };
      return b.handle === "start" ? C.start = b.current : b.handle === "end" ? C.end = b.current : C.control = b.current, C;
    }
    return y;
  }, Ra = $.useCallback(
    (h, y) => {
      const C = Math.min(Bu, Math.max(Fu, x.zoom * h)), A = C / x.zoom;
      k({ type: "setView", zoom: C, pan: { x: y.x - (y.x - x.pan.x) * A, y: y.y - (y.y - x.pan.y) * A } });
    },
    [x.zoom, x.pan]
  ), Zg = (h) => Ra(h, { x: Jn.width / 2, y: Jn.height / 2 });
  $.useEffect(() => {
    const h = B.current;
    if (!h) return;
    const y = (C) => {
      C.preventDefault(), Ra(Math.exp(-C.deltaY * 2e-3), Ht(C.clientX, C.clientY));
    };
    return h.addEventListener("wheel", y, { passive: !1 }), () => h.removeEventListener("wheel", y);
  }, [Ra, Ht]);
  const Qg = (h, y) => {
    let C;
    if (h === "playerA" || h === "playerB") {
      const A = h === "playerA" ? "teamA" : "teamB";
      C = zy({ colour: A, number: My(M, A) });
    } else h === "ball" ? C = Ay() : C = Ly();
    ue({ type: "addObject", object: C, stepIndex: ve, position: jt(_o(y, M.pitch.viewport)) });
  }, _d = () => {
    const h = Cs.map((A) => A.id), y = ho.map((A) => A.id);
    if (!h.length && !y.length) return;
    const C = [];
    y.length && C.push({ type: "removeDrawings", stepIndex: ve, drawingIds: y }), h.length && C.push({ type: "removeObjects", objectIds: h }), ue(C.length === 1 ? C[0] : { type: "batch", commands: C }), k({ type: "clearSelection" });
  }, Cd = () => {
    const h = Cs.map((K) => K.id), y = ho.map((K) => K.id);
    if (!h.length && !y.length) return;
    const C = h.map((K) => vt(K.split("_")[0] ?? "obj")), A = y.map((K) => vt(K.split("_")[0] ?? "drawing")), ee = [];
    h.length && ee.push({ type: "duplicateObjects", objectIds: h, newIds: C, offset: { x: 3, y: 3 } }), y.length && ee.push({ type: "duplicateDrawings", stepIndex: ve, drawingIds: y, newIds: A, offset: { x: 3, y: 3 } }), ue(ee.length === 1 ? ee[0] : { type: "batch", commands: ee }), k({ type: "select", ids: [...C, ...A] });
  }, Kg = (h, y) => ue({ type: "updateObject", objectId: h, patch: y }), Yg = (h, y) => {
    const C = { type: "updateDrawing", stepIndex: ve, drawingId: h, patch: { ...y } };
    y.type && y.type !== "kick" && (C.patch.arcHeight = null), y.type === "kick" && (C.patch.arcHeight = 0.5), ue(C);
  }, Gg = (h) => {
    const y = ct.drawings.find((A) => A.id === h);
    if (!y) return;
    const C = On(y, Pe);
    ue({ type: "updateDrawing", stepIndex: ve, drawingId: h, patch: { control: y.control ? null : jt(F1(C.start, C.end)) } });
  }, Xg = (h) => {
    const y = ct.drawings.find((A) => A.id === h);
    if (!y) return;
    const C = On(y, Pe);
    ue({ type: "updateDrawing", stepIndex: ve, drawingId: h, patch: { points: [jt(C.start), jt(C.end)], fromObjectId: null, toObjectId: null } });
  }, Jg = (h) => {
    const y = Ru(M.steps[h], vt("step"));
    ue({ type: "addStep", afterIndex: h, step: y }), k({ type: "setStep", index: h + 1 });
  }, qg = (h) => {
    const y = M.steps[Math.max(0, h - 1)], C = Ru(y, vt("step"));
    ue({ type: "addStep", afterIndex: h - 1, step: C }), k({ type: "setStep", index: h });
  }, ev = (h) => {
    ue({ type: "duplicateStep", index: h, newId: vt("step") }), k({ type: "setStep", index: h + 1 });
  }, tv = (h) => {
    M.steps.length <= 1 || (ue({ type: "removeStep", index: h }), k({ type: "setStep", index: Math.max(0, Math.min(h, M.steps.length - 2)) }));
  }, nv = (h, y) => {
    h !== y && (ue({ type: "moveStep", from: h, to: y }), k({ type: "setStep", index: y }));
  }, Da = (h) => k({ type: "setTool", tool: h }), mo = (h) => {
    k({ type: "setPresenting", on: h }), h ? ae(ve) : m((y) => vl(y)), c?.(h), setTimeout(() => _e.current?.focus(), 0);
  }, rv = () => {
    const h = _e.current;
    !h || typeof document > "u" || (document.fullscreenElement ? document.exitFullscreen?.() : h.requestFullscreen?.());
  }, za = (h) => ue({ type: "setMetadata", patch: h }), Ed = (h, y) => y.shiftKey || y.metaKey || y.ctrlKey || x.multiSelectMode ? (k({ type: "toggleSelect", id: h }), _s.has(h) ? null : [...x.selectedIds, h]) : _s.has(h) ? x.selectedIds : (k({ type: "select", ids: [h] }), [h]), jd = (h, y, C, A) => {
    const ee = h.filter((Ce) => kd.has(Ce)), K = h.filter((Ce) => !kd.has(Ce)), ne = C ? Pe[C] : void 0, pe = ne ?? A;
    v({ kind: "move", pointerId: y.pointerId, objectIds: ee, drawingIds: K, primaryId: C, offset: ne ? { x: ne.x - A.x, y: ne.y - A.y } : { x: 0, y: 0 }, start: pe, position: pe, moved: !1 });
  }, $d = (h) => M.objects.filter((y) => y.type === "player" || h === "kick" && y.type === "ball").map((y) => y.id), Aa = (h, y, C = []) => {
    const A = new Set($d(h)), ee = {};
    for (const [K, ne] of Object.entries(Pe)) A.has(K) && (ee[K] = ne);
    return B1(y, ee, Xw, C);
  }, Id = (h, y, C) => {
    const A = po(h.clientX, h.clientY), ee = C && $d(y).includes(C), K = Cl(y, "from") ? ee ? C : Aa(y, A) : void 0, ne = K ? Pe[K] : A, pe = { kind: "draw", pointerId: h.pointerId, tool: y, start: ne, current: A };
    K && (pe.fromObjectId = K), v(pe);
  }, Es = (h) => {
    Z.current.set(h.pointerId, { x: h.clientX, y: h.clientY }), B.current?.setPointerCapture?.(h.pointerId);
  }, Td = () => x.presenting || i ? !1 : (N && le(), !0), ov = (h) => (y) => {
    if (b || (y.preventDefault(), y.stopPropagation(), !Td())) return;
    if (Es(y), bl(x.tool)) return Id(y, x.tool, h);
    if (_l(x.tool)) return;
    const C = Ed(h, y);
    C && jd(C, y, h, po(y.clientX, y.clientY));
  }, sv = (h) => (y) => {
    if (b || x.tool !== "select" || (y.preventDefault(), y.stopPropagation(), !Td())) return;
    Es(y);
    const C = Ed(h, y);
    C && jd(C, y, null, po(y.clientX, y.clientY));
  }, La = (h, y) => (C) => {
    if (b) return;
    C.preventDefault(), C.stopPropagation(), Es(C);
    const A = ct.drawings.find((ne) => ne.id === h);
    if (!A) return;
    const ee = On(A, Pe), K = y === "start" ? ee.start : y === "end" ? ee.end : ee.control ?? ee.end;
    v({ kind: "handle", pointerId: C.pointerId, drawingId: h, handle: y, current: K, moved: !1 });
  }, iv = (h) => {
    if (Es(h), Z.current.size === 2) {
      const [y, C] = [...Z.current.entries()], A = Ht(y[1].x, y[1].y), ee = Ht(C[1].x, C[1].y);
      v({ kind: "pinch", ids: [y[0], C[0]], startDist: Math.hypot(A.x - ee.x, A.y - ee.y) || 1, startMid: { x: (A.x + ee.x) / 2, y: (A.y + ee.y) / 2 }, startZoom: x.zoom, startPan: x.pan }), k({ type: "setGuides", guides: [] });
      return;
    }
    if (!b) {
      if (!x.presenting && !i) {
        if (bl(x.tool))
          return N && le(), Id(h, x.tool);
        if (_l(x.tool)) {
          Qg(x.tool, po(h.clientX, h.clientY));
          return;
        }
      }
      v({ kind: "pan", pointerId: h.pointerId, startClient: { x: h.clientX, y: h.clientY }, startPan: x.pan, moved: !1 });
    }
  }, av = (h) => {
    if (!Z.current.has(h.pointerId)) return;
    Z.current.set(h.pointerId, { x: h.clientX, y: h.clientY });
    const y = I.current;
    if (!y) return;
    if (y.kind === "pinch") {
      const K = Z.current.get(y.ids[0]), ne = Z.current.get(y.ids[1]);
      if (!K || !ne) return;
      const pe = Ht(K.x, K.y), Ce = Ht(ne.x, ne.y), Zt = Math.hypot(pe.x - Ce.x, pe.y - Ce.y) || 1, Sn = { x: (pe.x + Ce.x) / 2, y: (pe.y + Ce.y) / 2 }, Ir = Math.min(Bu, Math.max(Fu, y.startZoom * (Zt / y.startDist))), Pd = Ir / y.startZoom;
      k({ type: "setView", zoom: Ir, pan: { x: Sn.x - (y.startMid.x - y.startPan.x) * Pd, y: Sn.y - (y.startMid.y - y.startPan.y) * Pd } });
      return;
    }
    if (y.pointerId !== h.pointerId) return;
    if (y.kind === "pan") {
      const K = h.clientX - y.startClient.x, ne = h.clientY - y.startClient.y;
      if (!(y.moved || Math.hypot(K, ne) > Gw)) return;
      const Ce = Ht(y.startClient.x, y.startClient.y), Zt = Ht(h.clientX, h.clientY);
      k({ type: "setView", zoom: x.zoom, pan: { x: y.startPan.x + (Zt.x - Ce.x), y: y.startPan.y + (Zt.y - Ce.y) } }), y.moved || v({ ...y, moved: !0 });
      return;
    }
    const C = po(h.clientX, h.clientY);
    if (y.kind === "draw") {
      const K = _o(C, M.pitch.viewport), ne = y.fromObjectId ? [y.fromObjectId] : [], pe = Cl(y.tool, "to") ? Aa(y.tool, K, ne) : void 0, Ce = { ...y, current: K };
      pe ? Ce.toCandidate = pe : delete Ce.toCandidate, v(Ce);
      return;
    }
    if (y.kind === "handle") {
      const K = _o(C, M.pitch.viewport), ne = ct.drawings.find((Ir) => Ir.id === y.drawingId), pe = ne && y.handle !== "control" && Cl(ne.type, y.handle === "start" ? "from" : "to"), Ce = ne ? y.handle === "start" ? ne.toObjectId : ne.fromObjectId : void 0, Zt = pe && ne ? Aa(ne.type, K, Ce ? [Ce] : []) : void 0, Sn = { ...y, current: K, moved: !0 };
      Zt ? Sn.candidate = Zt : delete Sn.candidate, v(Sn);
      return;
    }
    let A = _o({ x: C.x + y.offset.x, y: C.y + y.offset.y }, M.pitch.viewport), ee = [];
    if (y.objectIds.length === 1 && y.drawingIds.length === 0) {
      const K = M.objects.filter((pe) => pe.id !== y.objectIds[0]).map((pe) => Pe[pe.id]).filter((pe) => !!pe), ne = A1(A, K, M.pitch);
      A = _o(ne.point, M.pitch.viewport), ee = ne.guides;
    }
    k({ type: "setGuides", guides: ee }), v({ ...y, position: A, moved: y.moved || A.x !== y.start.x || A.y !== y.start.y });
  }, Nd = (h) => {
    Z.current.delete(h.pointerId);
    const y = I.current;
    if (!y) return;
    if (y.kind === "pinch") {
      y.ids.includes(h.pointerId) && v(null);
      return;
    }
    if (y.pointerId !== h.pointerId) return;
    if (v(null), k({ type: "setGuides", guides: [] }), y.kind === "pan") {
      !y.moved && !x.multiSelectMode && k({ type: "clearSelection" });
      return;
    }
    if (y.kind === "draw") {
      const K = y.toCandidate ? Pe[y.toCandidate] : y.current;
      if (Math.hypot(K.x - y.start.x, K.y - y.start.y) < Jw) return;
      const ne = {};
      y.fromObjectId && (ne.fromObjectId = y.fromObjectId), y.toCandidate && (ne.toObjectId = y.toCandidate), ue({ type: "addDrawing", stepIndex: ve, drawing: zu(y.tool, jt(y.start), jt(K), ne) });
      return;
    }
    if (y.kind === "handle") {
      if (!y.moved) return;
      const K = ct.drawings.find((Ir) => Ir.id === y.drawingId);
      if (!K) return;
      const ne = On(K, Pe), pe = jt(y.current);
      if (y.handle === "control") {
        ue({ type: "updateDrawing", stepIndex: ve, drawingId: K.id, patch: { control: pe } });
        return;
      }
      const Ce = y.candidate ? jt(Pe[y.candidate]) : pe, Zt = y.handle === "start" ? [Ce, jt(ne.end)] : [jt(ne.start), Ce], Sn = y.handle === "start" ? { points: Zt, fromObjectId: y.candidate ?? null } : { points: Zt, toObjectId: y.candidate ?? null };
      ue({ type: "updateDrawing", stepIndex: ve, drawingId: K.id, patch: Sn });
      return;
    }
    if (!y.moved) return;
    const C = jt(y.position), A = jt({ x: C.x - y.start.x, y: C.y - y.start.y });
    if (A.x === 0 && A.y === 0) return;
    const ee = [];
    y.objectIds.length === 1 && y.drawingIds.length === 0 ? ee.push({ type: "moveObject", objectId: y.objectIds[0], stepIndex: ve, to: C }) : y.objectIds.length && ee.push({ type: "moveObjects", objectIds: y.objectIds, stepIndex: ve, delta: A }), y.drawingIds.length && ee.push({ type: "moveDrawings", stepIndex: ve, drawingIds: y.drawingIds, delta: A }), ue(ee.length === 1 ? ee[0] : { type: "batch", commands: ee });
  }, lv = (h) => {
    const y = h.target;
    if (y.tagName === "INPUT" || y.tagName === "SELECT" || y.tagName === "TEXTAREA") return;
    if (i) {
      h.key === " " ? (h.preventDefault(), Ct()) : h.key === "ArrowLeft" ? (h.preventDefault(), Ss()) : h.key === "ArrowRight" ? (h.preventDefault(), bs()) : h.key === "Escape" && x.presenting && mo(!1);
      return;
    }
    const C = h.metaKey || h.ctrlKey, A = h.key.toLowerCase();
    if (h.key === " ") {
      h.preventDefault(), Ct();
      return;
    }
    if (h.key === "ArrowLeft") {
      h.preventDefault(), Ss();
      return;
    }
    if (h.key === "ArrowRight") {
      h.preventDefault(), bs();
      return;
    }
    if (x.presenting) {
      h.key === "Escape" && mo(!1);
      return;
    }
    C && A === "z" ? (h.preventDefault(), h.shiftKey ? Er() : Wt()) : C && A === "d" ? (h.preventDefault(), Cd()) : h.key === "Delete" || h.key === "Backspace" ? (h.preventDefault(), _d()) : h.key === "Escape" ? x.tool !== "select" ? Da("select") : k({ type: "clearSelection" }) : !C && lp[A] && Da(lp[A]);
  }, uv = $.useMemo(() => [...M.objects].sort((h, y) => ap[h.type] - ap[y.type]), [M.objects]), jr = M.pitch.viewport, cv = (h, y) => {
    const C = h.axis === "x" ? He({ x: h.at, y: jr.y - 5 }) : He({ x: jr.x - 5, y: h.at }), A = h.axis === "x" ? He({ x: h.at, y: jr.y + jr.height + 5 }) : He({ x: jr.x + jr.width + 5, y: h.at });
    return /* @__PURE__ */ d.jsx("line", { x1: C.x, y1: C.y, x2: A.x, y2: A.y, stroke: kw, strokeWidth: 0.18 / x.zoom, strokeDasharray: h.source === "object" ? "0.8 0.5" : void 0, pointerEvents: "none" }, y);
  }, Fa = b?.kind === "draw" ? (() => {
    const h = b.toCandidate ? Pe[b.toCandidate] : b.current;
    return { drawing: zu(b.tool, b.start, h, { id: "__preview" }), path: { start: b.start, end: h } };
  })() : null, Ba = b?.kind === "draw" ? b.toCandidate : b?.kind === "handle" ? b.candidate : void 0, $r = !N && !x.presenting && !i && x.tool === "select" && ho.length === 1 && Cs.length === 0 ? ho[0] : void 0, Et = $r ? bd($r) : void 0, dv = bl(x.tool) || _l(x.tool) ? "crosshair" : void 0, Od = M.steps[U]?.note ?? "", fv = /* @__PURE__ */ d.jsx(
    Fw,
    {
      board: M,
      playback: f,
      easing: S,
      compact: x.presenting,
      onPlayPause: Ct,
      onRestart: qn,
      onPrev: Ss,
      onNext: bs,
      onScrub: xd,
      onLoop: (h) => m((y) => ({ ...y, loop: h })),
      onEasing: _,
      ...r || l ? {} : { onPresent: () => mo(!0) }
    }
  );
  return /* @__PURE__ */ d.jsxs("div", { ref: _e, className: `tb-root${x.presenting ? " tb-present" : ""}${n ? ` ${n}` : ""}`, tabIndex: 0, onKeyDown: lv, "data-presenting": x.presenting ? "true" : void 0, children: [
    x.presenting ? /* @__PURE__ */ d.jsxs("div", { "data-testid": "present-bar", className: "tb-present-head", children: [
      /* @__PURE__ */ d.jsx("span", { className: "tb-present-title", children: M.metadata.name }),
      /* @__PURE__ */ d.jsxs("span", { "data-testid": "present-step", className: "tb-present-step", children: [
        "Step ",
        U + 1,
        " / ",
        M.steps.length,
        M.steps[U]?.label ? ` · ${M.steps[U].label}` : ""
      ] })
    ] }) : /* @__PURE__ */ d.jsxs(d.Fragment, { children: [
      (r || l) && /* @__PURE__ */ d.jsx(
        Vw,
        {
          board: M,
          saveStatus: s,
          readOnly: i,
          actions: a,
          backLabel: o,
          onBack: r,
          onRename: (h) => za({ name: h }),
          onKind: (h) => za({ kind: h }),
          onFavourite: (h) => za({ favourite: h }),
          onExport: (h) => l?.(h, M, U),
          onPresent: () => mo(!0)
        }
      ),
      i ? /* @__PURE__ */ d.jsx("div", { className: "tb-viewonly", "data-testid": "view-only-notice", children: "View only — you can watch this tactic but not change it." }) : /* @__PURE__ */ d.jsx(
        Mw,
        {
          board: M,
          tool: x.tool,
          zoom: x.zoom,
          multiSelectMode: x.multiSelectMode,
          canUndo: q1(p),
          canRedo: ew(p),
          onUndo: Wt,
          onRedo: Er,
          onTool: Da,
          onPreset: (h) => {
            ue({ type: "setPitchView", preset: h }), k({ type: "resetView" });
          },
          onOrientation: (h) => {
            ue({ type: "setPitchView", orientation: h }), k({ type: "resetView" });
          },
          onZoom: Zg,
          onResetView: () => k({ type: "resetView" }),
          onMultiSelectMode: (h) => k({ type: "setMultiSelectMode", on: h })
        }
      ),
      !i && /* @__PURE__ */ d.jsx(Ow, { board: M, selectedObjects: Cs, selectedDrawings: ho, onPatch: Kg, onDrawingPatch: Yg, onToggleCurve: Gg, onDetach: Xg, onDelete: _d, onDuplicate: Cd })
    ] }),
    /* @__PURE__ */ d.jsxs("div", { className: "tb-canvas", children: [
      /* @__PURE__ */ d.jsx(
        "svg",
        {
          ref: B,
          viewBox: `0 0 ${Jn.width} ${Jn.height}`,
          preserveAspectRatio: "xMidYMid meet",
          style: { width: "100%", height: "100%", touchAction: "none", display: "block", userSelect: "none", cursor: dv },
          onPointerDown: iv,
          onPointerMove: av,
          onPointerUp: Nd,
          onPointerCancel: Nd,
          role: "application",
          "aria-label": "Tactics board",
          "data-zoom": x.zoom.toFixed(3),
          "data-step": ve,
          "data-tool": x.tool,
          "data-time": V.toFixed(3),
          "data-playing": f.playing ? "true" : void 0,
          children: /* @__PURE__ */ d.jsxs("g", { transform: `translate(${x.pan.x} ${x.pan.y}) scale(${x.zoom})`, children: [
            /* @__PURE__ */ d.jsx(Hy, { pitch: M.pitch, frame: tt }),
            /* @__PURE__ */ d.jsx("g", { "data-layer": "guides", children: x.guides.map(cv) }),
            /* @__PURE__ */ d.jsx("g", { "data-layer": "drawings", children: Hg.map((h) => /* @__PURE__ */ d.jsx(Lu, { drawing: h, path: bd(h), frame: tt, colours: M.teamColours, selected: _s.has(h.id), zoom: x.zoom, onPointerDown: N || x.presenting ? void 0 : sv(h.id) }, h.id)) }),
            /* @__PURE__ */ d.jsx("g", { "data-layer": "objects", children: uv.map((h) => {
              const y = Sd[h.id];
              return y ? /* @__PURE__ */ d.jsx(
                Zy,
                {
                  object: h,
                  position: He(y),
                  z: y.z ?? 0,
                  selected: _s.has(h.id),
                  dragging: b?.kind === "move" && b.objectIds.includes(h.id),
                  colours: M.teamColours,
                  warning: h.type === "player" && Ry(M, h.id).length > 0,
                  onPointerDown: ov(h.id)
                },
                h.id
              ) : null;
            }) }),
            /* @__PURE__ */ d.jsxs("g", { "data-layer": "overlay", pointerEvents: "none", children: [
              Ba && Pe[Ba] && (() => {
                const h = He(Pe[Ba]);
                return /* @__PURE__ */ d.jsx("circle", { "data-testid": "attach-candidate", cx: h.x, cy: h.y, r: 2.6, fill: "none", stroke: io, strokeWidth: 0.35, strokeDasharray: "0.7 0.5" });
              })(),
              Fa && /* @__PURE__ */ d.jsx(Lu, { drawing: Fa.drawing, path: Fa.path, frame: tt, colours: M.teamColours, selected: !1, zoom: x.zoom })
            ] }),
            $r && Et && /* @__PURE__ */ d.jsxs("g", { "data-layer": "handles", children: [
              Et.control && /* @__PURE__ */ d.jsx("path", { d: `M ${He(Et.start).x} ${He(Et.start).y} L ${He(Et.control).x} ${He(Et.control).y} L ${He(Et.end).x} ${He(Et.end).y}`, fill: "none", stroke: io, strokeWidth: 0.12 / x.zoom, strokeDasharray: "0.5 0.5", opacity: 0.7, pointerEvents: "none" }),
              /* @__PURE__ */ d.jsx(kl, { at: He(Et.start), kind: "start", zoom: x.zoom, onPointerDown: La($r.id, "start") }),
              /* @__PURE__ */ d.jsx(kl, { at: He(Et.end), kind: "end", zoom: x.zoom, onPointerDown: La($r.id, "end") }),
              Et.control && /* @__PURE__ */ d.jsx(kl, { at: He(Et.control), kind: "control", zoom: x.zoom, onPointerDown: La($r.id, "control") })
            ] })
          ] })
        }
      ),
      x.presenting && Od && /* @__PURE__ */ d.jsx("div", { "data-testid": "present-note", className: "tb-present-note", children: Od })
    ] }),
    !x.presenting && /* @__PURE__ */ d.jsx(
      Lw,
      {
        readOnly: i,
        board: M,
        currentStep: ve,
        playingStep: N ? U : null,
        onSelect: wd,
        onAdd: () => Jg(ve),
        onInsertBefore: qg,
        onDuplicate: ev,
        onDelete: tv,
        onMove: nv,
        onLabel: (h, y) => ue({ type: "setStepLabel", index: h, label: y }),
        onNote: (h, y) => ue({ type: "setStepNote", index: h, note: y }),
        onDuration: (h, y) => ue({ type: "setStepDuration", index: h, durationMs: y })
      }
    ),
    x.presenting ? /* @__PURE__ */ d.jsx(
      Uw,
      {
        board: M,
        playback: f,
        displayStep: U,
        onPlayPause: Ct,
        onRestart: qn,
        onPrev: Ss,
        onNext: bs,
        onScrub: xd,
        onLoop: (h) => m((y) => ({ ...y, loop: h })),
        onSelectStep: wd,
        onExit: () => mo(!1),
        onFullscreen: typeof document < "u" && "requestFullscreen" in document.documentElement ? rv : void 0
      }
    ) : fv
  ] });
}
var co = {};
/**
 * @license React
 * react-dom-server-legacy.browser.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var Yy = $;
function Y(e) {
  for (var t = "https://reactjs.org/docs/error-decoder.html?invariant=" + e, n = 1; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
  return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
}
var nt = Object.prototype.hasOwnProperty, ek = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/, up = {}, cp = {};
function Gy(e) {
  return nt.call(cp, e) ? !0 : nt.call(up, e) ? !1 : ek.test(e) ? cp[e] = !0 : (up[e] = !0, !1);
}
function qe(e, t, n, r, o, s, i) {
  this.acceptsBooleans = t === 2 || t === 3 || t === 4, this.attributeName = r, this.attributeNamespace = o, this.mustUseProperty = n, this.propertyName = e, this.type = t, this.sanitizeURL = s, this.removeEmptyString = i;
}
var Ae = {};
"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e) {
  Ae[e] = new qe(e, 0, !1, e, null, !1, !1);
});
[["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(e) {
  var t = e[0];
  Ae[t] = new qe(t, 1, !1, e[1], null, !1, !1);
});
["contentEditable", "draggable", "spellCheck", "value"].forEach(function(e) {
  Ae[e] = new qe(e, 2, !1, e.toLowerCase(), null, !1, !1);
});
["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(e) {
  Ae[e] = new qe(e, 2, !1, e, null, !1, !1);
});
"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e) {
  Ae[e] = new qe(e, 3, !1, e.toLowerCase(), null, !1, !1);
});
["checked", "multiple", "muted", "selected"].forEach(function(e) {
  Ae[e] = new qe(e, 3, !0, e, null, !1, !1);
});
["capture", "download"].forEach(function(e) {
  Ae[e] = new qe(e, 4, !1, e, null, !1, !1);
});
["cols", "rows", "size", "span"].forEach(function(e) {
  Ae[e] = new qe(e, 6, !1, e, null, !1, !1);
});
["rowSpan", "start"].forEach(function(e) {
  Ae[e] = new qe(e, 5, !1, e.toLowerCase(), null, !1, !1);
});
var Jc = /[\-:]([a-z])/g;
function qc(e) {
  return e[1].toUpperCase();
}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e) {
  var t = e.replace(
    Jc,
    qc
  );
  Ae[t] = new qe(t, 1, !1, e, null, !1, !1);
});
"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e) {
  var t = e.replace(Jc, qc);
  Ae[t] = new qe(t, 1, !1, e, "http://www.w3.org/1999/xlink", !1, !1);
});
["xml:base", "xml:lang", "xml:space"].forEach(function(e) {
  var t = e.replace(Jc, qc);
  Ae[t] = new qe(t, 1, !1, e, "http://www.w3.org/XML/1998/namespace", !1, !1);
});
["tabIndex", "crossOrigin"].forEach(function(e) {
  Ae[e] = new qe(e, 1, !1, e.toLowerCase(), null, !1, !1);
});
Ae.xlinkHref = new qe("xlinkHref", 1, !1, "xlink:href", "http://www.w3.org/1999/xlink", !0, !1);
["src", "href", "action", "formAction"].forEach(function(e) {
  Ae[e] = new qe(e, 1, !1, e.toLowerCase(), null, !0, !0);
});
var di = {
  animationIterationCount: !0,
  aspectRatio: !0,
  borderImageOutset: !0,
  borderImageSlice: !0,
  borderImageWidth: !0,
  boxFlex: !0,
  boxFlexGroup: !0,
  boxOrdinalGroup: !0,
  columnCount: !0,
  columns: !0,
  flex: !0,
  flexGrow: !0,
  flexPositive: !0,
  flexShrink: !0,
  flexNegative: !0,
  flexOrder: !0,
  gridArea: !0,
  gridRow: !0,
  gridRowEnd: !0,
  gridRowSpan: !0,
  gridRowStart: !0,
  gridColumn: !0,
  gridColumnEnd: !0,
  gridColumnSpan: !0,
  gridColumnStart: !0,
  fontWeight: !0,
  lineClamp: !0,
  lineHeight: !0,
  opacity: !0,
  order: !0,
  orphans: !0,
  tabSize: !0,
  widows: !0,
  zIndex: !0,
  zoom: !0,
  fillOpacity: !0,
  floodOpacity: !0,
  stopOpacity: !0,
  strokeDasharray: !0,
  strokeDashoffset: !0,
  strokeMiterlimit: !0,
  strokeOpacity: !0,
  strokeWidth: !0
}, tk = ["Webkit", "ms", "Moz", "O"];
Object.keys(di).forEach(function(e) {
  tk.forEach(function(t) {
    t = t + e.charAt(0).toUpperCase() + e.substring(1), di[t] = di[e];
  });
});
var nk = /["'&<>]/;
function Ke(e) {
  if (typeof e == "boolean" || typeof e == "number") return "" + e;
  e = "" + e;
  var t = nk.exec(e);
  if (t) {
    var n = "", r, o = 0;
    for (r = t.index; r < e.length; r++) {
      switch (e.charCodeAt(r)) {
        case 34:
          t = "&quot;";
          break;
        case 38:
          t = "&amp;";
          break;
        case 39:
          t = "&#x27;";
          break;
        case 60:
          t = "&lt;";
          break;
        case 62:
          t = "&gt;";
          break;
        default:
          continue;
      }
      o !== r && (n += e.substring(o, r)), o = r + 1, n += t;
    }
    e = o !== r ? n + e.substring(o, r) : n;
  }
  return e;
}
var rk = /([A-Z])/g, ok = /^ms-/, Vu = Array.isArray;
function on(e, t) {
  return { insertionMode: e, selectedValue: t };
}
function sk(e, t, n) {
  switch (t) {
    case "select":
      return on(1, n.value != null ? n.value : n.defaultValue);
    case "svg":
      return on(2, null);
    case "math":
      return on(3, null);
    case "foreignObject":
      return on(1, null);
    case "table":
      return on(4, null);
    case "thead":
    case "tbody":
    case "tfoot":
      return on(5, null);
    case "colgroup":
      return on(7, null);
    case "tr":
      return on(6, null);
  }
  return 4 <= e.insertionMode || e.insertionMode === 0 ? on(1, null) : e;
}
var dp = /* @__PURE__ */ new Map();
function Xy(e, t, n) {
  if (typeof n != "object") throw Error(Y(62));
  t = !0;
  for (var r in n) if (nt.call(n, r)) {
    var o = n[r];
    if (o != null && typeof o != "boolean" && o !== "") {
      if (r.indexOf("--") === 0) {
        var s = Ke(r);
        o = Ke(("" + o).trim());
      } else {
        s = r;
        var i = dp.get(s);
        i !== void 0 || (i = Ke(s.replace(rk, "-$1").toLowerCase().replace(ok, "-ms-")), dp.set(s, i)), s = i, o = typeof o == "number" ? o === 0 || nt.call(di, r) ? "" + o : o + "px" : Ke(("" + o).trim());
      }
      t ? (t = !1, e.push(' style="', s, ":", o)) : e.push(";", s, ":", o);
    }
  }
  t || e.push('"');
}
function dt(e, t, n, r) {
  switch (n) {
    case "style":
      Xy(e, t, r);
      return;
    case "defaultValue":
    case "defaultChecked":
    case "innerHTML":
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
      return;
  }
  if (!(2 < n.length) || n[0] !== "o" && n[0] !== "O" || n[1] !== "n" && n[1] !== "N") {
    if (t = Ae.hasOwnProperty(n) ? Ae[n] : null, t !== null) {
      switch (typeof r) {
        case "function":
        case "symbol":
          return;
        case "boolean":
          if (!t.acceptsBooleans) return;
      }
      switch (n = t.attributeName, t.type) {
        case 3:
          r && e.push(" ", n, '=""');
          break;
        case 4:
          r === !0 ? e.push(" ", n, '=""') : r !== !1 && e.push(" ", n, '="', Ke(r), '"');
          break;
        case 5:
          isNaN(r) || e.push(" ", n, '="', Ke(r), '"');
          break;
        case 6:
          !isNaN(r) && 1 <= r && e.push(" ", n, '="', Ke(r), '"');
          break;
        default:
          t.sanitizeURL && (r = "" + r), e.push(" ", n, '="', Ke(r), '"');
      }
    } else if (Gy(n)) {
      switch (typeof r) {
        case "function":
        case "symbol":
          return;
        case "boolean":
          if (t = n.toLowerCase().slice(0, 5), t !== "data-" && t !== "aria-") return;
      }
      e.push(" ", n, '="', Ke(r), '"');
    }
  }
}
function fi(e, t, n) {
  if (t != null) {
    if (n != null) throw Error(Y(60));
    if (typeof t != "object" || !("__html" in t)) throw Error(Y(61));
    t = t.__html, t != null && e.push("" + t);
  }
}
function ik(e) {
  var t = "";
  return Yy.Children.forEach(e, function(n) {
    n != null && (t += n);
  }), t;
}
function El(e, t, n, r) {
  e.push(Kt(n));
  var o = n = null, s;
  for (s in t) if (nt.call(t, s)) {
    var i = t[s];
    if (i != null) switch (s) {
      case "children":
        n = i;
        break;
      case "dangerouslySetInnerHTML":
        o = i;
        break;
      default:
        dt(e, r, s, i);
    }
  }
  return e.push(">"), fi(e, o, n), typeof n == "string" ? (e.push(Ke(n)), null) : n;
}
var ak = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, fp = /* @__PURE__ */ new Map();
function Kt(e) {
  var t = fp.get(e);
  if (t === void 0) {
    if (!ak.test(e)) throw Error(Y(65, e));
    t = "<" + e, fp.set(e, t);
  }
  return t;
}
function lk(e, t, n, r, o) {
  switch (t) {
    case "select":
      e.push(Kt("select"));
      var s = null, i = null;
      for (c in n) if (nt.call(n, c)) {
        var a = n[c];
        if (a != null) switch (c) {
          case "children":
            s = a;
            break;
          case "dangerouslySetInnerHTML":
            i = a;
            break;
          case "defaultValue":
          case "value":
            break;
          default:
            dt(e, r, c, a);
        }
      }
      return e.push(">"), fi(e, i, s), s;
    case "option":
      i = o.selectedValue, e.push(Kt("option"));
      var l = a = null, u = null, c = null;
      for (s in n) if (nt.call(n, s)) {
        var p = n[s];
        if (p != null) switch (s) {
          case "children":
            a = p;
            break;
          case "selected":
            u = p;
            break;
          case "dangerouslySetInnerHTML":
            c = p;
            break;
          case "value":
            l = p;
          default:
            dt(e, r, s, p);
        }
      }
      if (i != null) if (n = l !== null ? "" + l : ik(a), Vu(i)) {
        for (r = 0; r < i.length; r++)
          if ("" + i[r] === n) {
            e.push(' selected=""');
            break;
          }
      } else "" + i === n && e.push(' selected=""');
      else u && e.push(' selected=""');
      return e.push(">"), fi(e, c, a), a;
    case "textarea":
      e.push(Kt("textarea")), c = i = s = null;
      for (a in n) if (nt.call(n, a) && (l = n[a], l != null)) switch (a) {
        case "children":
          c = l;
          break;
        case "value":
          s = l;
          break;
        case "defaultValue":
          i = l;
          break;
        case "dangerouslySetInnerHTML":
          throw Error(Y(91));
        default:
          dt(
            e,
            r,
            a,
            l
          );
      }
      if (s === null && i !== null && (s = i), e.push(">"), c != null) {
        if (s != null) throw Error(Y(92));
        if (Vu(c) && 1 < c.length) throw Error(Y(93));
        s = "" + c;
      }
      return typeof s == "string" && s[0] === `
` && e.push(`
`), s !== null && e.push(Ke("" + s)), null;
    case "input":
      e.push(Kt("input")), l = c = a = s = null;
      for (i in n) if (nt.call(n, i) && (u = n[i], u != null)) switch (i) {
        case "children":
        case "dangerouslySetInnerHTML":
          throw Error(Y(399, "input"));
        case "defaultChecked":
          l = u;
          break;
        case "defaultValue":
          a = u;
          break;
        case "checked":
          c = u;
          break;
        case "value":
          s = u;
          break;
        default:
          dt(e, r, i, u);
      }
      return c !== null ? dt(e, r, "checked", c) : l !== null && dt(e, r, "checked", l), s !== null ? dt(e, r, "value", s) : a !== null && dt(e, r, "value", a), e.push("/>"), null;
    case "menuitem":
      e.push(Kt("menuitem"));
      for (var g in n) if (nt.call(n, g) && (s = n[g], s != null)) switch (g) {
        case "children":
        case "dangerouslySetInnerHTML":
          throw Error(Y(400));
        default:
          dt(e, r, g, s);
      }
      return e.push(">"), null;
    case "title":
      e.push(Kt("title")), s = null;
      for (p in n) if (nt.call(n, p) && (i = n[p], i != null)) switch (p) {
        case "children":
          s = i;
          break;
        case "dangerouslySetInnerHTML":
          throw Error(Y(434));
        default:
          dt(e, r, p, i);
      }
      return e.push(">"), s;
    case "listing":
    case "pre":
      e.push(Kt(t)), i = s = null;
      for (l in n) if (nt.call(n, l) && (a = n[l], a != null)) switch (l) {
        case "children":
          s = a;
          break;
        case "dangerouslySetInnerHTML":
          i = a;
          break;
        default:
          dt(e, r, l, a);
      }
      if (e.push(">"), i != null) {
        if (s != null) throw Error(Y(60));
        if (typeof i != "object" || !("__html" in i)) throw Error(Y(61));
        n = i.__html, n != null && (typeof n == "string" && 0 < n.length && n[0] === `
` ? e.push(`
`, n) : e.push("" + n));
      }
      return typeof s == "string" && s[0] === `
` && e.push(`
`), s;
    case "area":
    case "base":
    case "br":
    case "col":
    case "embed":
    case "hr":
    case "img":
    case "keygen":
    case "link":
    case "meta":
    case "param":
    case "source":
    case "track":
    case "wbr":
      e.push(Kt(t));
      for (var w in n) if (nt.call(n, w) && (s = n[w], s != null)) switch (w) {
        case "children":
        case "dangerouslySetInnerHTML":
          throw Error(Y(399, t));
        default:
          dt(e, r, w, s);
      }
      return e.push("/>"), null;
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      return El(
        e,
        n,
        t,
        r
      );
    case "html":
      return o.insertionMode === 0 && e.push("<!DOCTYPE html>"), El(e, n, t, r);
    default:
      if (t.indexOf("-") === -1 && typeof n.is != "string") return El(e, n, t, r);
      e.push(Kt(t)), i = s = null;
      for (u in n) if (nt.call(n, u) && (a = n[u], a != null)) switch (u) {
        case "children":
          s = a;
          break;
        case "dangerouslySetInnerHTML":
          i = a;
          break;
        case "style":
          Xy(e, r, a);
          break;
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
          break;
        default:
          Gy(u) && typeof a != "function" && typeof a != "symbol" && e.push(" ", u, '="', Ke(a), '"');
      }
      return e.push(">"), fi(e, i, s), s;
  }
}
function pp(e, t, n) {
  if (e.push('<!--$?--><template id="'), n === null) throw Error(Y(395));
  return e.push(n), e.push('"></template>');
}
function uk(e, t, n, r) {
  switch (n.insertionMode) {
    case 0:
    case 1:
      return e.push('<div hidden id="'), e.push(t.segmentPrefix), t = r.toString(16), e.push(t), e.push('">');
    case 2:
      return e.push('<svg aria-hidden="true" style="display:none" id="'), e.push(t.segmentPrefix), t = r.toString(16), e.push(t), e.push('">');
    case 3:
      return e.push('<math aria-hidden="true" style="display:none" id="'), e.push(t.segmentPrefix), t = r.toString(16), e.push(t), e.push('">');
    case 4:
      return e.push('<table hidden id="'), e.push(t.segmentPrefix), t = r.toString(16), e.push(t), e.push('">');
    case 5:
      return e.push('<table hidden><tbody id="'), e.push(t.segmentPrefix), t = r.toString(16), e.push(t), e.push('">');
    case 6:
      return e.push('<table hidden><tr id="'), e.push(t.segmentPrefix), t = r.toString(16), e.push(t), e.push('">');
    case 7:
      return e.push('<table hidden><colgroup id="'), e.push(t.segmentPrefix), t = r.toString(16), e.push(t), e.push('">');
    default:
      throw Error(Y(397));
  }
}
function ck(e, t) {
  switch (t.insertionMode) {
    case 0:
    case 1:
      return e.push("</div>");
    case 2:
      return e.push("</svg>");
    case 3:
      return e.push("</math>");
    case 4:
      return e.push("</table>");
    case 5:
      return e.push("</tbody></table>");
    case 6:
      return e.push("</tr></table>");
    case 7:
      return e.push("</colgroup></table>");
    default:
      throw Error(Y(397));
  }
}
var dk = /[<\u2028\u2029]/g;
function jl(e) {
  return JSON.stringify(e).replace(dk, function(t) {
    switch (t) {
      case "<":
        return "\\u003c";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        throw Error("escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React");
    }
  });
}
function fk(e, t) {
  return t = t === void 0 ? "" : t, { bootstrapChunks: [], startInlineScript: "<script>", placeholderPrefix: t + "P:", segmentPrefix: t + "S:", boundaryPrefix: t + "B:", idPrefix: t, nextSuspenseID: 0, sentCompleteSegmentFunction: !1, sentCompleteBoundaryFunction: !1, sentClientRenderFunction: !1, generateStaticMarkup: e };
}
function hp(e, t, n, r) {
  return n.generateStaticMarkup ? (e.push(Ke(t)), !1) : (t === "" ? e = r : (r && e.push("<!-- -->"), e.push(Ke(t)), e = !0), e);
}
var Ho = Object.assign, pk = Symbol.for("react.element"), Jy = Symbol.for("react.portal"), qy = Symbol.for("react.fragment"), eg = Symbol.for("react.strict_mode"), tg = Symbol.for("react.profiler"), ng = Symbol.for("react.provider"), rg = Symbol.for("react.context"), og = Symbol.for("react.forward_ref"), sg = Symbol.for("react.suspense"), ig = Symbol.for("react.suspense_list"), ag = Symbol.for("react.memo"), ed = Symbol.for("react.lazy"), hk = Symbol.for("react.scope"), mk = Symbol.for("react.debug_trace_mode"), yk = Symbol.for("react.legacy_hidden"), gk = Symbol.for("react.default_value"), mp = Symbol.iterator;
function Uu(e) {
  if (e == null) return null;
  if (typeof e == "function") return e.displayName || e.name || null;
  if (typeof e == "string") return e;
  switch (e) {
    case qy:
      return "Fragment";
    case Jy:
      return "Portal";
    case tg:
      return "Profiler";
    case eg:
      return "StrictMode";
    case sg:
      return "Suspense";
    case ig:
      return "SuspenseList";
  }
  if (typeof e == "object") switch (e.$$typeof) {
    case rg:
      return (e.displayName || "Context") + ".Consumer";
    case ng:
      return (e._context.displayName || "Context") + ".Provider";
    case og:
      var t = e.render;
      return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
    case ag:
      return t = e.displayName || null, t !== null ? t : Uu(e.type) || "Memo";
    case ed:
      t = e._payload, e = e._init;
      try {
        return Uu(e(t));
      } catch {
      }
  }
  return null;
}
var lg = {};
function yp(e, t) {
  if (e = e.contextTypes, !e) return lg;
  var n = {}, r;
  for (r in e) n[r] = t[r];
  return n;
}
var ur = null;
function $a(e, t) {
  if (e !== t) {
    e.context._currentValue2 = e.parentValue, e = e.parent;
    var n = t.parent;
    if (e === null) {
      if (n !== null) throw Error(Y(401));
    } else {
      if (n === null) throw Error(Y(401));
      $a(e, n);
    }
    t.context._currentValue2 = t.value;
  }
}
function ug(e) {
  e.context._currentValue2 = e.parentValue, e = e.parent, e !== null && ug(e);
}
function cg(e) {
  var t = e.parent;
  t !== null && cg(t), e.context._currentValue2 = e.value;
}
function dg(e, t) {
  if (e.context._currentValue2 = e.parentValue, e = e.parent, e === null) throw Error(Y(402));
  e.depth === t.depth ? $a(e, t) : dg(e, t);
}
function fg(e, t) {
  var n = t.parent;
  if (n === null) throw Error(Y(402));
  e.depth === n.depth ? $a(e, n) : fg(e, n), t.context._currentValue2 = t.value;
}
function ta(e) {
  var t = ur;
  t !== e && (t === null ? cg(e) : e === null ? ug(t) : t.depth === e.depth ? $a(t, e) : t.depth > e.depth ? dg(t, e) : fg(t, e), ur = e);
}
var gp = { isMounted: function() {
  return !1;
}, enqueueSetState: function(e, t) {
  e = e._reactInternals, e.queue !== null && e.queue.push(t);
}, enqueueReplaceState: function(e, t) {
  e = e._reactInternals, e.replace = !0, e.queue = [t];
}, enqueueForceUpdate: function() {
} };
function vp(e, t, n, r) {
  var o = e.state !== void 0 ? e.state : null;
  e.updater = gp, e.props = n, e.state = o;
  var s = { queue: [], replace: !1 };
  e._reactInternals = s;
  var i = t.contextType;
  if (e.context = typeof i == "object" && i !== null ? i._currentValue2 : r, i = t.getDerivedStateFromProps, typeof i == "function" && (i = i(n, o), o = i == null ? o : Ho({}, o, i), e.state = o), typeof t.getDerivedStateFromProps != "function" && typeof e.getSnapshotBeforeUpdate != "function" && (typeof e.UNSAFE_componentWillMount == "function" || typeof e.componentWillMount == "function")) if (t = e.state, typeof e.componentWillMount == "function" && e.componentWillMount(), typeof e.UNSAFE_componentWillMount == "function" && e.UNSAFE_componentWillMount(), t !== e.state && gp.enqueueReplaceState(e, e.state, null), s.queue !== null && 0 < s.queue.length) if (t = s.queue, i = s.replace, s.queue = null, s.replace = !1, i && t.length === 1) e.state = t[0];
  else {
    for (s = i ? t[0] : e.state, o = !0, i = i ? 1 : 0; i < t.length; i++) {
      var a = t[i];
      a = typeof a == "function" ? a.call(e, s, n, r) : a, a != null && (o ? (o = !1, s = Ho({}, s, a)) : Ho(s, a));
    }
    e.state = s;
  }
  else s.queue = null;
}
var vk = { id: 1, overflow: "" };
function Wu(e, t, n) {
  var r = e.id;
  e = e.overflow;
  var o = 32 - pi(r) - 1;
  r &= ~(1 << o), n += 1;
  var s = 32 - pi(t) + o;
  if (30 < s) {
    var i = o - o % 5;
    return s = (r & (1 << i) - 1).toString(32), r >>= i, o -= i, { id: 1 << 32 - pi(t) + o | n << o | r, overflow: s + e };
  }
  return { id: 1 << s | n << o | r, overflow: e };
}
var pi = Math.clz32 ? Math.clz32 : kk, xk = Math.log, wk = Math.LN2;
function kk(e) {
  return e >>>= 0, e === 0 ? 32 : 31 - (xk(e) / wk | 0) | 0;
}
function Sk(e, t) {
  return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
}
var bk = typeof Object.is == "function" ? Object.is : Sk, xn = null, td = null, hi = null, ce = null, To = !1, na = !1, fs = 0, Rn = null, Ia = 0;
function rr() {
  if (xn === null) throw Error(Y(321));
  return xn;
}
function xp() {
  if (0 < Ia) throw Error(Y(312));
  return { memoizedState: null, queue: null, next: null };
}
function nd() {
  return ce === null ? hi === null ? (To = !1, hi = ce = xp()) : (To = !0, ce = hi) : ce.next === null ? (To = !1, ce = ce.next = xp()) : (To = !0, ce = ce.next), ce;
}
function rd() {
  td = xn = null, na = !1, hi = null, Ia = 0, ce = Rn = null;
}
function pg(e, t) {
  return typeof t == "function" ? t(e) : t;
}
function wp(e, t, n) {
  if (xn = rr(), ce = nd(), To) {
    var r = ce.queue;
    if (t = r.dispatch, Rn !== null && (n = Rn.get(r), n !== void 0)) {
      Rn.delete(r), r = ce.memoizedState;
      do
        r = e(r, n.action), n = n.next;
      while (n !== null);
      return ce.memoizedState = r, [r, t];
    }
    return [ce.memoizedState, t];
  }
  return e = e === pg ? typeof t == "function" ? t() : t : n !== void 0 ? n(t) : t, ce.memoizedState = e, e = ce.queue = { last: null, dispatch: null }, e = e.dispatch = _k.bind(null, xn, e), [ce.memoizedState, e];
}
function kp(e, t) {
  if (xn = rr(), ce = nd(), t = t === void 0 ? null : t, ce !== null) {
    var n = ce.memoizedState;
    if (n !== null && t !== null) {
      var r = n[1];
      e: if (r === null) r = !1;
      else {
        for (var o = 0; o < r.length && o < t.length; o++) if (!bk(t[o], r[o])) {
          r = !1;
          break e;
        }
        r = !0;
      }
      if (r) return n[0];
    }
  }
  return e = e(), ce.memoizedState = [e, t], e;
}
function _k(e, t, n) {
  if (25 <= Ia) throw Error(Y(301));
  if (e === xn) if (na = !0, e = { action: n, next: null }, Rn === null && (Rn = /* @__PURE__ */ new Map()), n = Rn.get(t), n === void 0) Rn.set(t, e);
  else {
    for (t = n; t.next !== null; ) t = t.next;
    t.next = e;
  }
}
function Ck() {
  throw Error(Y(394));
}
function Qs() {
}
var Sp = { readContext: function(e) {
  return e._currentValue2;
}, useContext: function(e) {
  return rr(), e._currentValue2;
}, useMemo: kp, useReducer: wp, useRef: function(e) {
  xn = rr(), ce = nd();
  var t = ce.memoizedState;
  return t === null ? (e = { current: e }, ce.memoizedState = e) : t;
}, useState: function(e) {
  return wp(pg, e);
}, useInsertionEffect: Qs, useLayoutEffect: function() {
}, useCallback: function(e, t) {
  return kp(function() {
    return e;
  }, t);
}, useImperativeHandle: Qs, useEffect: Qs, useDebugValue: Qs, useDeferredValue: function(e) {
  return rr(), e;
}, useTransition: function() {
  return rr(), [
    !1,
    Ck
  ];
}, useId: function() {
  var e = td.treeContext, t = e.overflow;
  e = e.id, e = (e & ~(1 << 32 - pi(e) - 1)).toString(32) + t;
  var n = mi;
  if (n === null) throw Error(Y(404));
  return t = fs++, e = ":" + n.idPrefix + "R" + e, 0 < t && (e += "H" + t.toString(32)), e + ":";
}, useMutableSource: function(e, t) {
  return rr(), t(e._source);
}, useSyncExternalStore: function(e, t, n) {
  if (n === void 0) throw Error(Y(407));
  return n();
} }, mi = null, $l = Yy.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
function Ek(e) {
  return console.error(e), null;
}
function No() {
}
function jk(e, t, n, r, o, s, i, a, l) {
  var u = [], c = /* @__PURE__ */ new Set();
  return t = { destination: null, responseState: t, progressiveChunkSize: r === void 0 ? 12800 : r, status: 0, fatalError: null, nextSegmentId: 0, allPendingTasks: 0, pendingRootTasks: 0, completedRootSegment: null, abortableTasks: c, pingedTasks: u, clientRenderedBoundaries: [], completedBoundaries: [], partialBoundaries: [], onError: o === void 0 ? Ek : o, onAllReady: No, onShellReady: i === void 0 ? No : i, onShellError: No, onFatalError: No }, n = ra(t, 0, null, n, !1, !1), n.parentFlushed = !0, e = od(t, e, null, n, c, lg, null, vk), u.push(e), t;
}
function od(e, t, n, r, o, s, i, a) {
  e.allPendingTasks++, n === null ? e.pendingRootTasks++ : n.pendingTasks++;
  var l = { node: t, ping: function() {
    var u = e.pingedTasks;
    u.push(l), u.length === 1 && yg(e);
  }, blockedBoundary: n, blockedSegment: r, abortSet: o, legacyContext: s, context: i, treeContext: a };
  return o.add(l), l;
}
function ra(e, t, n, r, o, s) {
  return { status: 0, id: -1, index: t, parentFlushed: !1, chunks: [], children: [], formatContext: r, boundary: n, lastPushedText: o, textEmbedded: s };
}
function ps(e, t) {
  if (e = e.onError(t), e != null && typeof e != "string") throw Error('onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "' + typeof e + '" instead');
  return e;
}
function oa(e, t) {
  var n = e.onShellError;
  n(t), n = e.onFatalError, n(t), e.destination !== null ? (e.status = 2, e.destination.destroy(t)) : (e.status = 1, e.fatalError = t);
}
function bp(e, t, n, r, o) {
  for (xn = {}, td = t, fs = 0, e = n(r, o); na; ) na = !1, fs = 0, Ia += 1, ce = null, e = n(r, o);
  return rd(), e;
}
function _p(e, t, n, r) {
  var o = n.render(), s = r.childContextTypes;
  if (s != null) {
    var i = t.legacyContext;
    if (typeof n.getChildContext != "function") r = i;
    else {
      n = n.getChildContext();
      for (var a in n) if (!(a in s)) throw Error(Y(108, Uu(r) || "Unknown", a));
      r = Ho({}, i, n);
    }
    t.legacyContext = r, ht(e, t, o), t.legacyContext = i;
  } else ht(e, t, o);
}
function Cp(e, t) {
  if (e && e.defaultProps) {
    t = Ho({}, t), e = e.defaultProps;
    for (var n in e) t[n] === void 0 && (t[n] = e[n]);
    return t;
  }
  return t;
}
function Hu(e, t, n, r, o) {
  if (typeof n == "function") if (n.prototype && n.prototype.isReactComponent) {
    o = yp(n, t.legacyContext);
    var s = n.contextType;
    s = new n(r, typeof s == "object" && s !== null ? s._currentValue2 : o), vp(s, n, r, o), _p(e, t, s, n);
  } else {
    s = yp(n, t.legacyContext), o = bp(e, t, n, r, s);
    var i = fs !== 0;
    if (typeof o == "object" && o !== null && typeof o.render == "function" && o.$$typeof === void 0) vp(o, n, r, s), _p(e, t, o, n);
    else if (i) {
      r = t.treeContext, t.treeContext = Wu(r, 1, 0);
      try {
        ht(e, t, o);
      } finally {
        t.treeContext = r;
      }
    } else ht(e, t, o);
  }
  else if (typeof n == "string") {
    switch (o = t.blockedSegment, s = lk(o.chunks, n, r, e.responseState, o.formatContext), o.lastPushedText = !1, i = o.formatContext, o.formatContext = sk(i, n, r), Zu(e, t, s), o.formatContext = i, n) {
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "img":
      case "input":
      case "keygen":
      case "link":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
        break;
      default:
        o.chunks.push("</", n, ">");
    }
    o.lastPushedText = !1;
  } else {
    switch (n) {
      case yk:
      case mk:
      case eg:
      case tg:
      case qy:
        ht(e, t, r.children);
        return;
      case ig:
        ht(e, t, r.children);
        return;
      case hk:
        throw Error(Y(343));
      case sg:
        e: {
          n = t.blockedBoundary, o = t.blockedSegment, s = r.fallback, r = r.children, i = /* @__PURE__ */ new Set();
          var a = { id: null, rootSegmentID: -1, parentFlushed: !1, pendingTasks: 0, forceClientRender: !1, completedSegments: [], byteSize: 0, fallbackAbortableTasks: i, errorDigest: null }, l = ra(e, o.chunks.length, a, o.formatContext, !1, !1);
          o.children.push(l), o.lastPushedText = !1;
          var u = ra(e, 0, null, o.formatContext, !1, !1);
          u.parentFlushed = !0, t.blockedBoundary = a, t.blockedSegment = u;
          try {
            if (Zu(
              e,
              t,
              r
            ), e.responseState.generateStaticMarkup || u.lastPushedText && u.textEmbedded && u.chunks.push("<!-- -->"), u.status = 1, sa(a, u), a.pendingTasks === 0) break e;
          } catch (c) {
            u.status = 4, a.forceClientRender = !0, a.errorDigest = ps(e, c);
          } finally {
            t.blockedBoundary = n, t.blockedSegment = o;
          }
          t = od(e, s, n, l, i, t.legacyContext, t.context, t.treeContext), e.pingedTasks.push(t);
        }
        return;
    }
    if (typeof n == "object" && n !== null) switch (n.$$typeof) {
      case og:
        if (r = bp(e, t, n.render, r, o), fs !== 0) {
          n = t.treeContext, t.treeContext = Wu(n, 1, 0);
          try {
            ht(e, t, r);
          } finally {
            t.treeContext = n;
          }
        } else ht(e, t, r);
        return;
      case ag:
        n = n.type, r = Cp(n, r), Hu(e, t, n, r, o);
        return;
      case ng:
        if (o = r.children, n = n._context, r = r.value, s = n._currentValue2, n._currentValue2 = r, i = ur, ur = r = { parent: i, depth: i === null ? 0 : i.depth + 1, context: n, parentValue: s, value: r }, t.context = r, ht(e, t, o), e = ur, e === null) throw Error(Y(403));
        r = e.parentValue, e.context._currentValue2 = r === gk ? e.context._defaultValue : r, e = ur = e.parent, t.context = e;
        return;
      case rg:
        r = r.children, r = r(n._currentValue2), ht(e, t, r);
        return;
      case ed:
        o = n._init, n = o(n._payload), r = Cp(n, r), Hu(
          e,
          t,
          n,
          r,
          void 0
        );
        return;
    }
    throw Error(Y(130, n == null ? n : typeof n, ""));
  }
}
function ht(e, t, n) {
  if (t.node = n, typeof n == "object" && n !== null) {
    switch (n.$$typeof) {
      case pk:
        Hu(e, t, n.type, n.props, n.ref);
        return;
      case Jy:
        throw Error(Y(257));
      case ed:
        var r = n._init;
        n = r(n._payload), ht(e, t, n);
        return;
    }
    if (Vu(n)) {
      Ep(e, t, n);
      return;
    }
    if (n === null || typeof n != "object" ? r = null : (r = mp && n[mp] || n["@@iterator"], r = typeof r == "function" ? r : null), r && (r = r.call(n))) {
      if (n = r.next(), !n.done) {
        var o = [];
        do
          o.push(n.value), n = r.next();
        while (!n.done);
        Ep(e, t, o);
      }
      return;
    }
    throw e = Object.prototype.toString.call(n), Error(Y(31, e === "[object Object]" ? "object with keys {" + Object.keys(n).join(", ") + "}" : e));
  }
  typeof n == "string" ? (r = t.blockedSegment, r.lastPushedText = hp(t.blockedSegment.chunks, n, e.responseState, r.lastPushedText)) : typeof n == "number" && (r = t.blockedSegment, r.lastPushedText = hp(t.blockedSegment.chunks, "" + n, e.responseState, r.lastPushedText));
}
function Ep(e, t, n) {
  for (var r = n.length, o = 0; o < r; o++) {
    var s = t.treeContext;
    t.treeContext = Wu(s, r, o);
    try {
      Zu(e, t, n[o]);
    } finally {
      t.treeContext = s;
    }
  }
}
function Zu(e, t, n) {
  var r = t.blockedSegment.formatContext, o = t.legacyContext, s = t.context;
  try {
    return ht(e, t, n);
  } catch (l) {
    if (rd(), typeof l == "object" && l !== null && typeof l.then == "function") {
      n = l;
      var i = t.blockedSegment, a = ra(e, i.chunks.length, null, i.formatContext, i.lastPushedText, !0);
      i.children.push(a), i.lastPushedText = !1, e = od(e, t.node, t.blockedBoundary, a, t.abortSet, t.legacyContext, t.context, t.treeContext).ping, n.then(e, e), t.blockedSegment.formatContext = r, t.legacyContext = o, t.context = s, ta(s);
    } else throw t.blockedSegment.formatContext = r, t.legacyContext = o, t.context = s, ta(s), l;
  }
}
function $k(e) {
  var t = e.blockedBoundary;
  e = e.blockedSegment, e.status = 3, mg(this, t, e);
}
function hg(e, t, n) {
  var r = e.blockedBoundary;
  e.blockedSegment.status = 3, r === null ? (t.allPendingTasks--, t.status !== 2 && (t.status = 2, t.destination !== null && t.destination.push(null))) : (r.pendingTasks--, r.forceClientRender || (r.forceClientRender = !0, e = n === void 0 ? Error(Y(432)) : n, r.errorDigest = t.onError(e), r.parentFlushed && t.clientRenderedBoundaries.push(r)), r.fallbackAbortableTasks.forEach(function(o) {
    return hg(o, t, n);
  }), r.fallbackAbortableTasks.clear(), t.allPendingTasks--, t.allPendingTasks === 0 && (r = t.onAllReady, r()));
}
function sa(e, t) {
  if (t.chunks.length === 0 && t.children.length === 1 && t.children[0].boundary === null) {
    var n = t.children[0];
    n.id = t.id, n.parentFlushed = !0, n.status === 1 && sa(e, n);
  } else e.completedSegments.push(t);
}
function mg(e, t, n) {
  if (t === null) {
    if (n.parentFlushed) {
      if (e.completedRootSegment !== null) throw Error(Y(389));
      e.completedRootSegment = n;
    }
    e.pendingRootTasks--, e.pendingRootTasks === 0 && (e.onShellError = No, t = e.onShellReady, t());
  } else t.pendingTasks--, t.forceClientRender || (t.pendingTasks === 0 ? (n.parentFlushed && n.status === 1 && sa(t, n), t.parentFlushed && e.completedBoundaries.push(t), t.fallbackAbortableTasks.forEach($k, e), t.fallbackAbortableTasks.clear()) : n.parentFlushed && n.status === 1 && (sa(t, n), t.completedSegments.length === 1 && t.parentFlushed && e.partialBoundaries.push(t)));
  e.allPendingTasks--, e.allPendingTasks === 0 && (e = e.onAllReady, e());
}
function yg(e) {
  if (e.status !== 2) {
    var t = ur, n = $l.current;
    $l.current = Sp;
    var r = mi;
    mi = e.responseState;
    try {
      var o = e.pingedTasks, s;
      for (s = 0; s < o.length; s++) {
        var i = o[s], a = e, l = i.blockedSegment;
        if (l.status === 0) {
          ta(i.context);
          try {
            ht(a, i, i.node), a.responseState.generateStaticMarkup || l.lastPushedText && l.textEmbedded && l.chunks.push("<!-- -->"), i.abortSet.delete(i), l.status = 1, mg(a, i.blockedBoundary, l);
          } catch (x) {
            if (rd(), typeof x == "object" && x !== null && typeof x.then == "function") {
              var u = i.ping;
              x.then(u, u);
            } else {
              i.abortSet.delete(i), l.status = 4;
              var c = i.blockedBoundary, p = x, g = ps(a, p);
              if (c === null ? oa(a, p) : (c.pendingTasks--, c.forceClientRender || (c.forceClientRender = !0, c.errorDigest = g, c.parentFlushed && a.clientRenderedBoundaries.push(c))), a.allPendingTasks--, a.allPendingTasks === 0) {
                var w = a.onAllReady;
                w();
              }
            }
          } finally {
          }
        }
      }
      o.splice(0, s), e.destination !== null && sd(e, e.destination);
    } catch (x) {
      ps(e, x), oa(e, x);
    } finally {
      mi = r, $l.current = n, n === Sp && ta(t);
    }
  }
}
function Ks(e, t, n) {
  switch (n.parentFlushed = !0, n.status) {
    case 0:
      var r = n.id = e.nextSegmentId++;
      return n.lastPushedText = !1, n.textEmbedded = !1, e = e.responseState, t.push('<template id="'), t.push(e.placeholderPrefix), e = r.toString(16), t.push(e), t.push('"></template>');
    case 1:
      n.status = 2;
      var o = !0;
      r = n.chunks;
      var s = 0;
      n = n.children;
      for (var i = 0; i < n.length; i++) {
        for (o = n[i]; s < o.index; s++) t.push(r[s]);
        o = Ta(e, t, o);
      }
      for (; s < r.length - 1; s++) t.push(r[s]);
      return s < r.length && (o = t.push(r[s])), o;
    default:
      throw Error(Y(390));
  }
}
function Ta(e, t, n) {
  var r = n.boundary;
  if (r === null) return Ks(e, t, n);
  if (r.parentFlushed = !0, r.forceClientRender) return e.responseState.generateStaticMarkup || (r = r.errorDigest, t.push("<!--$!-->"), t.push("<template"), r && (t.push(' data-dgst="'), r = Ke(r), t.push(r), t.push('"')), t.push("></template>")), Ks(e, t, n), e = e.responseState.generateStaticMarkup ? !0 : t.push("<!--/$-->"), e;
  if (0 < r.pendingTasks) {
    r.rootSegmentID = e.nextSegmentId++, 0 < r.completedSegments.length && e.partialBoundaries.push(r);
    var o = e.responseState, s = o.nextSuspenseID++;
    return o = o.boundaryPrefix + s.toString(16), r = r.id = o, pp(t, e.responseState, r), Ks(e, t, n), t.push("<!--/$-->");
  }
  if (r.byteSize > e.progressiveChunkSize) return r.rootSegmentID = e.nextSegmentId++, e.completedBoundaries.push(r), pp(t, e.responseState, r.id), Ks(e, t, n), t.push("<!--/$-->");
  if (e.responseState.generateStaticMarkup || t.push("<!--$-->"), n = r.completedSegments, n.length !== 1) throw Error(Y(391));
  return Ta(e, t, n[0]), e = e.responseState.generateStaticMarkup ? !0 : t.push("<!--/$-->"), e;
}
function jp(e, t, n) {
  return uk(t, e.responseState, n.formatContext, n.id), Ta(e, t, n), ck(t, n.formatContext);
}
function $p(e, t, n) {
  for (var r = n.completedSegments, o = 0; o < r.length; o++) gg(e, t, n, r[o]);
  if (r.length = 0, e = e.responseState, r = n.id, n = n.rootSegmentID, t.push(e.startInlineScript), e.sentCompleteBoundaryFunction ? t.push('$RC("') : (e.sentCompleteBoundaryFunction = !0, t.push('function $RC(a,b){a=document.getElementById(a);b=document.getElementById(b);b.parentNode.removeChild(b);if(a){a=a.previousSibling;var f=a.parentNode,c=a.nextSibling,e=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d)if(0===e)break;else e--;else"$"!==d&&"$?"!==d&&"$!"!==d||e++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;b.firstChild;)f.insertBefore(b.firstChild,c);a.data="$";a._reactRetry&&a._reactRetry()}};$RC("')), r === null) throw Error(Y(395));
  return n = n.toString(16), t.push(r), t.push('","'), t.push(e.segmentPrefix), t.push(n), t.push('")<\/script>');
}
function gg(e, t, n, r) {
  if (r.status === 2) return !0;
  var o = r.id;
  if (o === -1) {
    if ((r.id = n.rootSegmentID) === -1) throw Error(Y(392));
    return jp(e, t, r);
  }
  return jp(e, t, r), e = e.responseState, t.push(e.startInlineScript), e.sentCompleteSegmentFunction ? t.push('$RS("') : (e.sentCompleteSegmentFunction = !0, t.push('function $RS(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("')), t.push(e.segmentPrefix), o = o.toString(16), t.push(o), t.push('","'), t.push(e.placeholderPrefix), t.push(o), t.push('")<\/script>');
}
function sd(e, t) {
  try {
    var n = e.completedRootSegment;
    if (n !== null && e.pendingRootTasks === 0) {
      Ta(e, t, n), e.completedRootSegment = null;
      var r = e.responseState.bootstrapChunks;
      for (n = 0; n < r.length - 1; n++) t.push(r[n]);
      n < r.length && t.push(r[n]);
    }
    var o = e.clientRenderedBoundaries, s;
    for (s = 0; s < o.length; s++) {
      var i = o[s];
      r = t;
      var a = e.responseState, l = i.id, u = i.errorDigest, c = i.errorMessage, p = i.errorComponentStack;
      if (r.push(a.startInlineScript), a.sentClientRenderFunction ? r.push('$RX("') : (a.sentClientRenderFunction = !0, r.push('function $RX(b,c,d,e){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),b._reactRetry&&b._reactRetry())};$RX("')), l === null) throw Error(Y(395));
      if (r.push(l), r.push('"'), u || c || p) {
        r.push(",");
        var g = jl(u || "");
        r.push(g);
      }
      if (c || p) {
        r.push(",");
        var w = jl(c || "");
        r.push(w);
      }
      if (p) {
        r.push(",");
        var x = jl(p);
        r.push(x);
      }
      if (!r.push(")<\/script>")) {
        e.destination = null, s++, o.splice(0, s);
        return;
      }
    }
    o.splice(0, s);
    var k = e.completedBoundaries;
    for (s = 0; s < k.length; s++) if (!$p(e, t, k[s])) {
      e.destination = null, s++, k.splice(0, s);
      return;
    }
    k.splice(0, s);
    var b = e.partialBoundaries;
    for (s = 0; s < b.length; s++) {
      var v = b[s];
      e: {
        o = e, i = t;
        var f = v.completedSegments;
        for (a = 0; a < f.length; a++) if (!gg(o, i, v, f[a])) {
          a++, f.splice(0, a);
          var m = !1;
          break e;
        }
        f.splice(0, a), m = !0;
      }
      if (!m) {
        e.destination = null, s++, b.splice(0, s);
        return;
      }
    }
    b.splice(0, s);
    var S = e.completedBoundaries;
    for (s = 0; s < S.length; s++) if (!$p(e, t, S[s])) {
      e.destination = null, s++, S.splice(0, s);
      return;
    }
    S.splice(0, s);
  } finally {
    e.allPendingTasks === 0 && e.pingedTasks.length === 0 && e.clientRenderedBoundaries.length === 0 && e.completedBoundaries.length === 0 && t.push(null);
  }
}
function Ik(e, t) {
  try {
    var n = e.abortableTasks;
    n.forEach(function(r) {
      return hg(r, e, t);
    }), n.clear(), e.destination !== null && sd(e, e.destination);
  } catch (r) {
    ps(e, r), oa(e, r);
  }
}
function Tk() {
}
function vg(e, t, n, r) {
  var o = !1, s = null, i = "", a = { push: function(u) {
    return u !== null && (i += u), !0;
  }, destroy: function(u) {
    o = !0, s = u;
  } }, l = !1;
  if (e = jk(e, fk(n, t ? t.identifierPrefix : void 0), { insertionMode: 1, selectedValue: null }, 1 / 0, Tk, void 0, function() {
    l = !0;
  }), yg(e), Ik(e, r), e.status === 1) e.status = 2, a.destroy(e.fatalError);
  else if (e.status !== 2 && e.destination === null) {
    e.destination = a;
    try {
      sd(e, a);
    } catch (u) {
      ps(e, u), oa(e, u);
    }
  }
  if (o) throw s;
  if (!l) throw Error(Y(426));
  return i;
}
co.renderToNodeStream = function() {
  throw Error(Y(207));
};
co.renderToStaticMarkup = function(e, t) {
  return vg(e, t, !0, 'The server used "renderToStaticMarkup" which does not support Suspense. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server');
};
co.renderToStaticNodeStream = function() {
  throw Error(Y(208));
};
co.renderToString = function(e, t) {
  return vg(e, t, !1, 'The server used "renderToString" which does not support Suspense. If you intended for this Suspense boundary to render the fallback content on the server consider throwing an Error somewhere within the Suspense boundary. If you intended to have the server wait for the suspended component please switch to "renderToReadableStream" which supports Suspense on the server');
};
co.version = "18.3.1";
var id = {};
/**
 * @license React
 * react-dom-server.browser.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var xg = $;
function X(e) {
  for (var t = "https://reactjs.org/docs/error-decoder.html?invariant=" + e, n = 1; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
  return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
}
var mt = null, yt = 0;
function F(e, t) {
  if (t.length !== 0) if (512 < t.length) 0 < yt && (e.enqueue(new Uint8Array(mt.buffer, 0, yt)), mt = new Uint8Array(512), yt = 0), e.enqueue(t);
  else {
    var n = mt.length - yt;
    n < t.length && (n === 0 ? e.enqueue(mt) : (mt.set(t.subarray(0, n), yt), e.enqueue(mt), t = t.subarray(n)), mt = new Uint8Array(512), yt = 0), mt.set(t, yt), yt += t.length;
  }
}
function me(e, t) {
  return F(e, t), !0;
}
function Ip(e) {
  mt && 0 < yt && (e.enqueue(new Uint8Array(mt.buffer, 0, yt)), mt = null, yt = 0);
}
var wg = new TextEncoder();
function q(e) {
  return wg.encode(e);
}
function P(e) {
  return wg.encode(e);
}
function kg(e, t) {
  typeof e.error == "function" ? e.error(t) : e.close();
}
var rt = Object.prototype.hasOwnProperty, Nk = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/, Tp = {}, Np = {};
function Sg(e) {
  return rt.call(Np, e) ? !0 : rt.call(Tp, e) ? !1 : Nk.test(e) ? Np[e] = !0 : (Tp[e] = !0, !1);
}
function et(e, t, n, r, o, s, i) {
  this.acceptsBooleans = t === 2 || t === 3 || t === 4, this.attributeName = r, this.attributeNamespace = o, this.mustUseProperty = n, this.propertyName = e, this.type = t, this.sanitizeURL = s, this.removeEmptyString = i;
}
var Le = {};
"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e) {
  Le[e] = new et(e, 0, !1, e, null, !1, !1);
});
[["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(e) {
  var t = e[0];
  Le[t] = new et(t, 1, !1, e[1], null, !1, !1);
});
["contentEditable", "draggable", "spellCheck", "value"].forEach(function(e) {
  Le[e] = new et(e, 2, !1, e.toLowerCase(), null, !1, !1);
});
["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(e) {
  Le[e] = new et(e, 2, !1, e, null, !1, !1);
});
"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e) {
  Le[e] = new et(e, 3, !1, e.toLowerCase(), null, !1, !1);
});
["checked", "multiple", "muted", "selected"].forEach(function(e) {
  Le[e] = new et(e, 3, !0, e, null, !1, !1);
});
["capture", "download"].forEach(function(e) {
  Le[e] = new et(e, 4, !1, e, null, !1, !1);
});
["cols", "rows", "size", "span"].forEach(function(e) {
  Le[e] = new et(e, 6, !1, e, null, !1, !1);
});
["rowSpan", "start"].forEach(function(e) {
  Le[e] = new et(e, 5, !1, e.toLowerCase(), null, !1, !1);
});
var ad = /[\-:]([a-z])/g;
function ld(e) {
  return e[1].toUpperCase();
}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e) {
  var t = e.replace(
    ad,
    ld
  );
  Le[t] = new et(t, 1, !1, e, null, !1, !1);
});
"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e) {
  var t = e.replace(ad, ld);
  Le[t] = new et(t, 1, !1, e, "http://www.w3.org/1999/xlink", !1, !1);
});
["xml:base", "xml:lang", "xml:space"].forEach(function(e) {
  var t = e.replace(ad, ld);
  Le[t] = new et(t, 1, !1, e, "http://www.w3.org/XML/1998/namespace", !1, !1);
});
["tabIndex", "crossOrigin"].forEach(function(e) {
  Le[e] = new et(e, 1, !1, e.toLowerCase(), null, !1, !1);
});
Le.xlinkHref = new et("xlinkHref", 1, !1, "xlink:href", "http://www.w3.org/1999/xlink", !0, !1);
["src", "href", "action", "formAction"].forEach(function(e) {
  Le[e] = new et(e, 1, !1, e.toLowerCase(), null, !0, !0);
});
var yi = {
  animationIterationCount: !0,
  aspectRatio: !0,
  borderImageOutset: !0,
  borderImageSlice: !0,
  borderImageWidth: !0,
  boxFlex: !0,
  boxFlexGroup: !0,
  boxOrdinalGroup: !0,
  columnCount: !0,
  columns: !0,
  flex: !0,
  flexGrow: !0,
  flexPositive: !0,
  flexShrink: !0,
  flexNegative: !0,
  flexOrder: !0,
  gridArea: !0,
  gridRow: !0,
  gridRowEnd: !0,
  gridRowSpan: !0,
  gridRowStart: !0,
  gridColumn: !0,
  gridColumnEnd: !0,
  gridColumnSpan: !0,
  gridColumnStart: !0,
  fontWeight: !0,
  lineClamp: !0,
  lineHeight: !0,
  opacity: !0,
  order: !0,
  orphans: !0,
  tabSize: !0,
  widows: !0,
  zIndex: !0,
  zoom: !0,
  fillOpacity: !0,
  floodOpacity: !0,
  stopOpacity: !0,
  strokeDasharray: !0,
  strokeDashoffset: !0,
  strokeMiterlimit: !0,
  strokeOpacity: !0,
  strokeWidth: !0
}, Ok = ["Webkit", "ms", "Moz", "O"];
Object.keys(yi).forEach(function(e) {
  Ok.forEach(function(t) {
    t = t + e.charAt(0).toUpperCase() + e.substring(1), yi[t] = yi[e];
  });
});
var Pk = /["'&<>]/;
function Re(e) {
  if (typeof e == "boolean" || typeof e == "number") return "" + e;
  e = "" + e;
  var t = Pk.exec(e);
  if (t) {
    var n = "", r, o = 0;
    for (r = t.index; r < e.length; r++) {
      switch (e.charCodeAt(r)) {
        case 34:
          t = "&quot;";
          break;
        case 38:
          t = "&amp;";
          break;
        case 39:
          t = "&#x27;";
          break;
        case 60:
          t = "&lt;";
          break;
        case 62:
          t = "&gt;";
          break;
        default:
          continue;
      }
      o !== r && (n += e.substring(o, r)), o = r + 1, n += t;
    }
    e = o !== r ? n + e.substring(o, r) : n;
  }
  return e;
}
var Mk = /([A-Z])/g, Rk = /^ms-/, Qu = Array.isArray, Dk = P("<script>"), zk = P("<\/script>"), Ak = P('<script src="'), Lk = P('<script type="module" src="'), Op = P('" async=""><\/script>'), Fk = /(<\/|<)(s)(cript)/gi;
function Bk(e, t, n, r) {
  return "" + t + (n === "s" ? "\\u0073" : "\\u0053") + r;
}
function Vk(e, t, n, r, o) {
  e = e === void 0 ? "" : e, t = t === void 0 ? Dk : P('<script nonce="' + Re(t) + '">');
  var s = [];
  if (n !== void 0 && s.push(t, q(("" + n).replace(Fk, Bk)), zk), r !== void 0) for (n = 0; n < r.length; n++) s.push(Ak, q(Re(r[n])), Op);
  if (o !== void 0) for (r = 0; r < o.length; r++) s.push(Lk, q(Re(o[r])), Op);
  return { bootstrapChunks: s, startInlineScript: t, placeholderPrefix: P(e + "P:"), segmentPrefix: P(e + "S:"), boundaryPrefix: e + "B:", idPrefix: e, nextSuspenseID: 0, sentCompleteSegmentFunction: !1, sentCompleteBoundaryFunction: !1, sentClientRenderFunction: !1 };
}
function Yt(e, t) {
  return { insertionMode: e, selectedValue: t };
}
function Uk(e) {
  return Yt(e === "http://www.w3.org/2000/svg" ? 2 : e === "http://www.w3.org/1998/Math/MathML" ? 3 : 0, null);
}
function Wk(e, t, n) {
  switch (t) {
    case "select":
      return Yt(1, n.value != null ? n.value : n.defaultValue);
    case "svg":
      return Yt(2, null);
    case "math":
      return Yt(3, null);
    case "foreignObject":
      return Yt(1, null);
    case "table":
      return Yt(4, null);
    case "thead":
    case "tbody":
    case "tfoot":
      return Yt(5, null);
    case "colgroup":
      return Yt(7, null);
    case "tr":
      return Yt(6, null);
  }
  return 4 <= e.insertionMode || e.insertionMode === 0 ? Yt(1, null) : e;
}
var ud = P("<!-- -->");
function Pp(e, t, n, r) {
  return t === "" ? r : (r && e.push(ud), e.push(q(Re(t))), !0);
}
var Mp = /* @__PURE__ */ new Map(), Hk = P(' style="'), Rp = P(":"), Zk = P(";");
function bg(e, t, n) {
  if (typeof n != "object") throw Error(X(62));
  t = !0;
  for (var r in n) if (rt.call(n, r)) {
    var o = n[r];
    if (o != null && typeof o != "boolean" && o !== "") {
      if (r.indexOf("--") === 0) {
        var s = q(Re(r));
        o = q(Re(("" + o).trim()));
      } else {
        s = r;
        var i = Mp.get(s);
        i !== void 0 || (i = P(Re(s.replace(Mk, "-$1").toLowerCase().replace(Rk, "-ms-"))), Mp.set(s, i)), s = i, o = typeof o == "number" ? o === 0 || rt.call(yi, r) ? q("" + o) : q(o + "px") : q(Re(("" + o).trim()));
      }
      t ? (t = !1, e.push(Hk, s, Rp, o)) : e.push(Zk, s, Rp, o);
    }
  }
  t || e.push(or);
}
var Cn = P(" "), Or = P('="'), or = P('"'), Dp = P('=""');
function ft(e, t, n, r) {
  switch (n) {
    case "style":
      bg(e, t, r);
      return;
    case "defaultValue":
    case "defaultChecked":
    case "innerHTML":
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
      return;
  }
  if (!(2 < n.length) || n[0] !== "o" && n[0] !== "O" || n[1] !== "n" && n[1] !== "N") {
    if (t = Le.hasOwnProperty(n) ? Le[n] : null, t !== null) {
      switch (typeof r) {
        case "function":
        case "symbol":
          return;
        case "boolean":
          if (!t.acceptsBooleans) return;
      }
      switch (n = q(t.attributeName), t.type) {
        case 3:
          r && e.push(Cn, n, Dp);
          break;
        case 4:
          r === !0 ? e.push(Cn, n, Dp) : r !== !1 && e.push(Cn, n, Or, q(Re(r)), or);
          break;
        case 5:
          isNaN(r) || e.push(Cn, n, Or, q(Re(r)), or);
          break;
        case 6:
          !isNaN(r) && 1 <= r && e.push(Cn, n, Or, q(Re(r)), or);
          break;
        default:
          t.sanitizeURL && (r = "" + r), e.push(Cn, n, Or, q(Re(r)), or);
      }
    } else if (Sg(n)) {
      switch (typeof r) {
        case "function":
        case "symbol":
          return;
        case "boolean":
          if (t = n.toLowerCase().slice(0, 5), t !== "data-" && t !== "aria-") return;
      }
      e.push(Cn, q(n), Or, q(Re(r)), or);
    }
  }
}
var En = P(">"), zp = P("/>");
function gi(e, t, n) {
  if (t != null) {
    if (n != null) throw Error(X(60));
    if (typeof t != "object" || !("__html" in t)) throw Error(X(61));
    t = t.__html, t != null && e.push(q("" + t));
  }
}
function Qk(e) {
  var t = "";
  return xg.Children.forEach(e, function(n) {
    n != null && (t += n);
  }), t;
}
var Il = P(' selected=""');
function Tl(e, t, n, r) {
  e.push(Gt(n));
  var o = n = null, s;
  for (s in t) if (rt.call(t, s)) {
    var i = t[s];
    if (i != null) switch (s) {
      case "children":
        n = i;
        break;
      case "dangerouslySetInnerHTML":
        o = i;
        break;
      default:
        ft(e, r, s, i);
    }
  }
  return e.push(En), gi(e, o, n), typeof n == "string" ? (e.push(q(Re(n))), null) : n;
}
var Nl = P(`
`), Kk = /^[a-zA-Z][a-zA-Z:_\.\-\d]*$/, Ap = /* @__PURE__ */ new Map();
function Gt(e) {
  var t = Ap.get(e);
  if (t === void 0) {
    if (!Kk.test(e)) throw Error(X(65, e));
    t = P("<" + e), Ap.set(e, t);
  }
  return t;
}
var Yk = P("<!DOCTYPE html>");
function Gk(e, t, n, r, o) {
  switch (t) {
    case "select":
      e.push(Gt("select"));
      var s = null, i = null;
      for (c in n) if (rt.call(n, c)) {
        var a = n[c];
        if (a != null) switch (c) {
          case "children":
            s = a;
            break;
          case "dangerouslySetInnerHTML":
            i = a;
            break;
          case "defaultValue":
          case "value":
            break;
          default:
            ft(e, r, c, a);
        }
      }
      return e.push(En), gi(e, i, s), s;
    case "option":
      i = o.selectedValue, e.push(Gt("option"));
      var l = a = null, u = null, c = null;
      for (s in n) if (rt.call(n, s)) {
        var p = n[s];
        if (p != null) switch (s) {
          case "children":
            a = p;
            break;
          case "selected":
            u = p;
            break;
          case "dangerouslySetInnerHTML":
            c = p;
            break;
          case "value":
            l = p;
          default:
            ft(e, r, s, p);
        }
      }
      if (i != null) if (n = l !== null ? "" + l : Qk(a), Qu(i)) {
        for (r = 0; r < i.length; r++)
          if ("" + i[r] === n) {
            e.push(Il);
            break;
          }
      } else "" + i === n && e.push(Il);
      else u && e.push(Il);
      return e.push(En), gi(e, c, a), a;
    case "textarea":
      e.push(Gt("textarea")), c = i = s = null;
      for (a in n) if (rt.call(n, a) && (l = n[a], l != null)) switch (a) {
        case "children":
          c = l;
          break;
        case "value":
          s = l;
          break;
        case "defaultValue":
          i = l;
          break;
        case "dangerouslySetInnerHTML":
          throw Error(X(91));
        default:
          ft(e, r, a, l);
      }
      if (s === null && i !== null && (s = i), e.push(En), c != null) {
        if (s != null) throw Error(X(92));
        if (Qu(c) && 1 < c.length) throw Error(X(93));
        s = "" + c;
      }
      return typeof s == "string" && s[0] === `
` && e.push(Nl), s !== null && e.push(q(Re("" + s))), null;
    case "input":
      e.push(Gt("input")), l = c = a = s = null;
      for (i in n) if (rt.call(n, i) && (u = n[i], u != null)) switch (i) {
        case "children":
        case "dangerouslySetInnerHTML":
          throw Error(X(399, "input"));
        case "defaultChecked":
          l = u;
          break;
        case "defaultValue":
          a = u;
          break;
        case "checked":
          c = u;
          break;
        case "value":
          s = u;
          break;
        default:
          ft(e, r, i, u);
      }
      return c !== null ? ft(
        e,
        r,
        "checked",
        c
      ) : l !== null && ft(e, r, "checked", l), s !== null ? ft(e, r, "value", s) : a !== null && ft(e, r, "value", a), e.push(zp), null;
    case "menuitem":
      e.push(Gt("menuitem"));
      for (var g in n) if (rt.call(n, g) && (s = n[g], s != null)) switch (g) {
        case "children":
        case "dangerouslySetInnerHTML":
          throw Error(X(400));
        default:
          ft(e, r, g, s);
      }
      return e.push(En), null;
    case "title":
      e.push(Gt("title")), s = null;
      for (p in n) if (rt.call(n, p) && (i = n[p], i != null)) switch (p) {
        case "children":
          s = i;
          break;
        case "dangerouslySetInnerHTML":
          throw Error(X(434));
        default:
          ft(e, r, p, i);
      }
      return e.push(En), s;
    case "listing":
    case "pre":
      e.push(Gt(t)), i = s = null;
      for (l in n) if (rt.call(n, l) && (a = n[l], a != null)) switch (l) {
        case "children":
          s = a;
          break;
        case "dangerouslySetInnerHTML":
          i = a;
          break;
        default:
          ft(e, r, l, a);
      }
      if (e.push(En), i != null) {
        if (s != null) throw Error(X(60));
        if (typeof i != "object" || !("__html" in i)) throw Error(X(61));
        n = i.__html, n != null && (typeof n == "string" && 0 < n.length && n[0] === `
` ? e.push(Nl, q(n)) : e.push(q("" + n)));
      }
      return typeof s == "string" && s[0] === `
` && e.push(Nl), s;
    case "area":
    case "base":
    case "br":
    case "col":
    case "embed":
    case "hr":
    case "img":
    case "keygen":
    case "link":
    case "meta":
    case "param":
    case "source":
    case "track":
    case "wbr":
      e.push(Gt(t));
      for (var w in n) if (rt.call(n, w) && (s = n[w], s != null)) switch (w) {
        case "children":
        case "dangerouslySetInnerHTML":
          throw Error(X(399, t));
        default:
          ft(e, r, w, s);
      }
      return e.push(zp), null;
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      return Tl(e, n, t, r);
    case "html":
      return o.insertionMode === 0 && e.push(Yk), Tl(e, n, t, r);
    default:
      if (t.indexOf("-") === -1 && typeof n.is != "string") return Tl(e, n, t, r);
      e.push(Gt(t)), i = s = null;
      for (u in n) if (rt.call(n, u) && (a = n[u], a != null)) switch (u) {
        case "children":
          s = a;
          break;
        case "dangerouslySetInnerHTML":
          i = a;
          break;
        case "style":
          bg(e, r, a);
          break;
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
          break;
        default:
          Sg(u) && typeof a != "function" && typeof a != "symbol" && e.push(Cn, q(u), Or, q(Re(a)), or);
      }
      return e.push(En), gi(e, i, s), s;
  }
}
var Xk = P("</"), Jk = P(">"), qk = P('<template id="'), eS = P('"></template>'), tS = P("<!--$-->"), nS = P('<!--$?--><template id="'), rS = P('"></template>'), oS = P("<!--$!-->"), sS = P("<!--/$-->"), iS = P("<template"), aS = P('"'), lS = P(' data-dgst="');
P(' data-msg="');
P(' data-stck="');
var uS = P("></template>");
function Lp(e, t, n) {
  if (F(e, nS), n === null) throw Error(X(395));
  return F(e, n), me(e, rS);
}
var cS = P('<div hidden id="'), dS = P('">'), fS = P("</div>"), pS = P('<svg aria-hidden="true" style="display:none" id="'), hS = P('">'), mS = P("</svg>"), yS = P('<math aria-hidden="true" style="display:none" id="'), gS = P('">'), vS = P("</math>"), xS = P('<table hidden id="'), wS = P('">'), kS = P("</table>"), SS = P('<table hidden><tbody id="'), bS = P('">'), _S = P("</tbody></table>"), CS = P('<table hidden><tr id="'), ES = P('">'), jS = P("</tr></table>"), $S = P('<table hidden><colgroup id="'), IS = P('">'), TS = P("</colgroup></table>");
function NS(e, t, n, r) {
  switch (n.insertionMode) {
    case 0:
    case 1:
      return F(e, cS), F(e, t.segmentPrefix), F(e, q(r.toString(16))), me(e, dS);
    case 2:
      return F(e, pS), F(e, t.segmentPrefix), F(e, q(r.toString(16))), me(e, hS);
    case 3:
      return F(e, yS), F(e, t.segmentPrefix), F(e, q(r.toString(16))), me(e, gS);
    case 4:
      return F(e, xS), F(e, t.segmentPrefix), F(e, q(r.toString(16))), me(e, wS);
    case 5:
      return F(e, SS), F(e, t.segmentPrefix), F(e, q(r.toString(16))), me(e, bS);
    case 6:
      return F(e, CS), F(e, t.segmentPrefix), F(e, q(r.toString(16))), me(e, ES);
    case 7:
      return F(
        e,
        $S
      ), F(e, t.segmentPrefix), F(e, q(r.toString(16))), me(e, IS);
    default:
      throw Error(X(397));
  }
}
function OS(e, t) {
  switch (t.insertionMode) {
    case 0:
    case 1:
      return me(e, fS);
    case 2:
      return me(e, mS);
    case 3:
      return me(e, vS);
    case 4:
      return me(e, kS);
    case 5:
      return me(e, _S);
    case 6:
      return me(e, jS);
    case 7:
      return me(e, TS);
    default:
      throw Error(X(397));
  }
}
var PS = P('function $RS(a,b){a=document.getElementById(a);b=document.getElementById(b);for(a.parentNode.removeChild(a);a.firstChild;)b.parentNode.insertBefore(a.firstChild,b);b.parentNode.removeChild(b)};$RS("'), MS = P('$RS("'), RS = P('","'), DS = P('")<\/script>'), zS = P('function $RC(a,b){a=document.getElementById(a);b=document.getElementById(b);b.parentNode.removeChild(b);if(a){a=a.previousSibling;var f=a.parentNode,c=a.nextSibling,e=0;do{if(c&&8===c.nodeType){var d=c.data;if("/$"===d)if(0===e)break;else e--;else"$"!==d&&"$?"!==d&&"$!"!==d||e++}d=c.nextSibling;f.removeChild(c);c=d}while(c);for(;b.firstChild;)f.insertBefore(b.firstChild,c);a.data="$";a._reactRetry&&a._reactRetry()}};$RC("'), AS = P('$RC("'), LS = P('","'), FS = P('")<\/script>'), BS = P('function $RX(b,c,d,e){var a=document.getElementById(b);a&&(b=a.previousSibling,b.data="$!",a=a.dataset,c&&(a.dgst=c),d&&(a.msg=d),e&&(a.stck=e),b._reactRetry&&b._reactRetry())};$RX("'), VS = P('$RX("'), US = P('"'), WS = P(")<\/script>"), Ol = P(","), HS = /[<\u2028\u2029]/g;
function Pl(e) {
  return JSON.stringify(e).replace(HS, function(t) {
    switch (t) {
      case "<":
        return "\\u003c";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        throw Error("escapeJSStringsForInstructionScripts encountered a match it does not know how to replace. this means the match regex and the replacement characters are no longer in sync. This is a bug in React");
    }
  });
}
var Zo = Object.assign, ZS = Symbol.for("react.element"), _g = Symbol.for("react.portal"), Cg = Symbol.for("react.fragment"), Eg = Symbol.for("react.strict_mode"), jg = Symbol.for("react.profiler"), $g = Symbol.for("react.provider"), Ig = Symbol.for("react.context"), Tg = Symbol.for("react.forward_ref"), Ng = Symbol.for("react.suspense"), Og = Symbol.for("react.suspense_list"), Pg = Symbol.for("react.memo"), cd = Symbol.for("react.lazy"), QS = Symbol.for("react.scope"), KS = Symbol.for("react.debug_trace_mode"), YS = Symbol.for("react.legacy_hidden"), GS = Symbol.for("react.default_value"), Fp = Symbol.iterator;
function Ku(e) {
  if (e == null) return null;
  if (typeof e == "function") return e.displayName || e.name || null;
  if (typeof e == "string") return e;
  switch (e) {
    case Cg:
      return "Fragment";
    case _g:
      return "Portal";
    case jg:
      return "Profiler";
    case Eg:
      return "StrictMode";
    case Ng:
      return "Suspense";
    case Og:
      return "SuspenseList";
  }
  if (typeof e == "object") switch (e.$$typeof) {
    case Ig:
      return (e.displayName || "Context") + ".Consumer";
    case $g:
      return (e._context.displayName || "Context") + ".Provider";
    case Tg:
      var t = e.render;
      return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
    case Pg:
      return t = e.displayName || null, t !== null ? t : Ku(e.type) || "Memo";
    case cd:
      t = e._payload, e = e._init;
      try {
        return Ku(e(t));
      } catch {
      }
  }
  return null;
}
var Mg = {};
function Bp(e, t) {
  if (e = e.contextTypes, !e) return Mg;
  var n = {}, r;
  for (r in e) n[r] = t[r];
  return n;
}
var cr = null;
function Na(e, t) {
  if (e !== t) {
    e.context._currentValue = e.parentValue, e = e.parent;
    var n = t.parent;
    if (e === null) {
      if (n !== null) throw Error(X(401));
    } else {
      if (n === null) throw Error(X(401));
      Na(e, n);
    }
    t.context._currentValue = t.value;
  }
}
function Rg(e) {
  e.context._currentValue = e.parentValue, e = e.parent, e !== null && Rg(e);
}
function Dg(e) {
  var t = e.parent;
  t !== null && Dg(t), e.context._currentValue = e.value;
}
function zg(e, t) {
  if (e.context._currentValue = e.parentValue, e = e.parent, e === null) throw Error(X(402));
  e.depth === t.depth ? Na(e, t) : zg(e, t);
}
function Ag(e, t) {
  var n = t.parent;
  if (n === null) throw Error(X(402));
  e.depth === n.depth ? Na(e, n) : Ag(e, n), t.context._currentValue = t.value;
}
function ia(e) {
  var t = cr;
  t !== e && (t === null ? Dg(e) : e === null ? Rg(t) : t.depth === e.depth ? Na(t, e) : t.depth > e.depth ? zg(t, e) : Ag(t, e), cr = e);
}
var Vp = { isMounted: function() {
  return !1;
}, enqueueSetState: function(e, t) {
  e = e._reactInternals, e.queue !== null && e.queue.push(t);
}, enqueueReplaceState: function(e, t) {
  e = e._reactInternals, e.replace = !0, e.queue = [t];
}, enqueueForceUpdate: function() {
} };
function Up(e, t, n, r) {
  var o = e.state !== void 0 ? e.state : null;
  e.updater = Vp, e.props = n, e.state = o;
  var s = { queue: [], replace: !1 };
  e._reactInternals = s;
  var i = t.contextType;
  if (e.context = typeof i == "object" && i !== null ? i._currentValue : r, i = t.getDerivedStateFromProps, typeof i == "function" && (i = i(n, o), o = i == null ? o : Zo({}, o, i), e.state = o), typeof t.getDerivedStateFromProps != "function" && typeof e.getSnapshotBeforeUpdate != "function" && (typeof e.UNSAFE_componentWillMount == "function" || typeof e.componentWillMount == "function")) if (t = e.state, typeof e.componentWillMount == "function" && e.componentWillMount(), typeof e.UNSAFE_componentWillMount == "function" && e.UNSAFE_componentWillMount(), t !== e.state && Vp.enqueueReplaceState(e, e.state, null), s.queue !== null && 0 < s.queue.length) if (t = s.queue, i = s.replace, s.queue = null, s.replace = !1, i && t.length === 1) e.state = t[0];
  else {
    for (s = i ? t[0] : e.state, o = !0, i = i ? 1 : 0; i < t.length; i++) {
      var a = t[i];
      a = typeof a == "function" ? a.call(e, s, n, r) : a, a != null && (o ? (o = !1, s = Zo({}, s, a)) : Zo(s, a));
    }
    e.state = s;
  }
  else s.queue = null;
}
var XS = { id: 1, overflow: "" };
function Yu(e, t, n) {
  var r = e.id;
  e = e.overflow;
  var o = 32 - vi(r) - 1;
  r &= ~(1 << o), n += 1;
  var s = 32 - vi(t) + o;
  if (30 < s) {
    var i = o - o % 5;
    return s = (r & (1 << i) - 1).toString(32), r >>= i, o -= i, { id: 1 << 32 - vi(t) + o | n << o | r, overflow: s + e };
  }
  return { id: 1 << s | n << o | r, overflow: e };
}
var vi = Math.clz32 ? Math.clz32 : eb, JS = Math.log, qS = Math.LN2;
function eb(e) {
  return e >>>= 0, e === 0 ? 32 : 31 - (JS(e) / qS | 0) | 0;
}
function tb(e, t) {
  return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
}
var nb = typeof Object.is == "function" ? Object.is : tb, wn = null, dd = null, xi = null, de = null, Oo = !1, aa = !1, hs = 0, Dn = null, Oa = 0;
function sr() {
  if (wn === null) throw Error(X(321));
  return wn;
}
function Wp() {
  if (0 < Oa) throw Error(X(312));
  return { memoizedState: null, queue: null, next: null };
}
function fd() {
  return de === null ? xi === null ? (Oo = !1, xi = de = Wp()) : (Oo = !0, de = xi) : de.next === null ? (Oo = !1, de = de.next = Wp()) : (Oo = !0, de = de.next), de;
}
function pd() {
  dd = wn = null, aa = !1, xi = null, Oa = 0, de = Dn = null;
}
function Lg(e, t) {
  return typeof t == "function" ? t(e) : t;
}
function Hp(e, t, n) {
  if (wn = sr(), de = fd(), Oo) {
    var r = de.queue;
    if (t = r.dispatch, Dn !== null && (n = Dn.get(r), n !== void 0)) {
      Dn.delete(r), r = de.memoizedState;
      do
        r = e(r, n.action), n = n.next;
      while (n !== null);
      return de.memoizedState = r, [r, t];
    }
    return [de.memoizedState, t];
  }
  return e = e === Lg ? typeof t == "function" ? t() : t : n !== void 0 ? n(t) : t, de.memoizedState = e, e = de.queue = { last: null, dispatch: null }, e = e.dispatch = rb.bind(null, wn, e), [de.memoizedState, e];
}
function Zp(e, t) {
  if (wn = sr(), de = fd(), t = t === void 0 ? null : t, de !== null) {
    var n = de.memoizedState;
    if (n !== null && t !== null) {
      var r = n[1];
      e: if (r === null) r = !1;
      else {
        for (var o = 0; o < r.length && o < t.length; o++) if (!nb(t[o], r[o])) {
          r = !1;
          break e;
        }
        r = !0;
      }
      if (r) return n[0];
    }
  }
  return e = e(), de.memoizedState = [e, t], e;
}
function rb(e, t, n) {
  if (25 <= Oa) throw Error(X(301));
  if (e === wn) if (aa = !0, e = { action: n, next: null }, Dn === null && (Dn = /* @__PURE__ */ new Map()), n = Dn.get(t), n === void 0) Dn.set(t, e);
  else {
    for (t = n; t.next !== null; ) t = t.next;
    t.next = e;
  }
}
function ob() {
  throw Error(X(394));
}
function Ys() {
}
var Qp = { readContext: function(e) {
  return e._currentValue;
}, useContext: function(e) {
  return sr(), e._currentValue;
}, useMemo: Zp, useReducer: Hp, useRef: function(e) {
  wn = sr(), de = fd();
  var t = de.memoizedState;
  return t === null ? (e = { current: e }, de.memoizedState = e) : t;
}, useState: function(e) {
  return Hp(Lg, e);
}, useInsertionEffect: Ys, useLayoutEffect: function() {
}, useCallback: function(e, t) {
  return Zp(function() {
    return e;
  }, t);
}, useImperativeHandle: Ys, useEffect: Ys, useDebugValue: Ys, useDeferredValue: function(e) {
  return sr(), e;
}, useTransition: function() {
  return sr(), [!1, ob];
}, useId: function() {
  var e = dd.treeContext, t = e.overflow;
  e = e.id, e = (e & ~(1 << 32 - vi(e) - 1)).toString(32) + t;
  var n = wi;
  if (n === null) throw Error(X(404));
  return t = hs++, e = ":" + n.idPrefix + "R" + e, 0 < t && (e += "H" + t.toString(32)), e + ":";
}, useMutableSource: function(e, t) {
  return sr(), t(e._source);
}, useSyncExternalStore: function(e, t, n) {
  if (n === void 0) throw Error(X(407));
  return n();
} }, wi = null, Ml = xg.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
function sb(e) {
  return console.error(e), null;
}
function Po() {
}
function ib(e, t, n, r, o, s, i, a, l) {
  var u = [], c = /* @__PURE__ */ new Set();
  return t = { destination: null, responseState: t, progressiveChunkSize: r === void 0 ? 12800 : r, status: 0, fatalError: null, nextSegmentId: 0, allPendingTasks: 0, pendingRootTasks: 0, completedRootSegment: null, abortableTasks: c, pingedTasks: u, clientRenderedBoundaries: [], completedBoundaries: [], partialBoundaries: [], onError: o === void 0 ? sb : o, onAllReady: s === void 0 ? Po : s, onShellReady: i === void 0 ? Po : i, onShellError: a === void 0 ? Po : a, onFatalError: l === void 0 ? Po : l }, n = la(t, 0, null, n, !1, !1), n.parentFlushed = !0, e = hd(t, e, null, n, c, Mg, null, XS), u.push(e), t;
}
function hd(e, t, n, r, o, s, i, a) {
  e.allPendingTasks++, n === null ? e.pendingRootTasks++ : n.pendingTasks++;
  var l = { node: t, ping: function() {
    var u = e.pingedTasks;
    u.push(l), u.length === 1 && Vg(e);
  }, blockedBoundary: n, blockedSegment: r, abortSet: o, legacyContext: s, context: i, treeContext: a };
  return o.add(l), l;
}
function la(e, t, n, r, o, s) {
  return { status: 0, id: -1, index: t, parentFlushed: !1, chunks: [], children: [], formatContext: r, boundary: n, lastPushedText: o, textEmbedded: s };
}
function ms(e, t) {
  if (e = e.onError(t), e != null && typeof e != "string") throw Error('onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "' + typeof e + '" instead');
  return e;
}
function ua(e, t) {
  var n = e.onShellError;
  n(t), n = e.onFatalError, n(t), e.destination !== null ? (e.status = 2, kg(e.destination, t)) : (e.status = 1, e.fatalError = t);
}
function Kp(e, t, n, r, o) {
  for (wn = {}, dd = t, hs = 0, e = n(r, o); aa; ) aa = !1, hs = 0, Oa += 1, de = null, e = n(r, o);
  return pd(), e;
}
function Yp(e, t, n, r) {
  var o = n.render(), s = r.childContextTypes;
  if (s != null) {
    var i = t.legacyContext;
    if (typeof n.getChildContext != "function") r = i;
    else {
      n = n.getChildContext();
      for (var a in n) if (!(a in s)) throw Error(X(108, Ku(r) || "Unknown", a));
      r = Zo({}, i, n);
    }
    t.legacyContext = r, gt(e, t, o), t.legacyContext = i;
  } else gt(e, t, o);
}
function Gp(e, t) {
  if (e && e.defaultProps) {
    t = Zo({}, t), e = e.defaultProps;
    for (var n in e) t[n] === void 0 && (t[n] = e[n]);
    return t;
  }
  return t;
}
function Gu(e, t, n, r, o) {
  if (typeof n == "function") if (n.prototype && n.prototype.isReactComponent) {
    o = Bp(n, t.legacyContext);
    var s = n.contextType;
    s = new n(r, typeof s == "object" && s !== null ? s._currentValue : o), Up(s, n, r, o), Yp(e, t, s, n);
  } else {
    s = Bp(n, t.legacyContext), o = Kp(e, t, n, r, s);
    var i = hs !== 0;
    if (typeof o == "object" && o !== null && typeof o.render == "function" && o.$$typeof === void 0) Up(o, n, r, s), Yp(e, t, o, n);
    else if (i) {
      r = t.treeContext, t.treeContext = Yu(r, 1, 0);
      try {
        gt(e, t, o);
      } finally {
        t.treeContext = r;
      }
    } else gt(e, t, o);
  }
  else if (typeof n == "string") {
    switch (o = t.blockedSegment, s = Gk(o.chunks, n, r, e.responseState, o.formatContext), o.lastPushedText = !1, i = o.formatContext, o.formatContext = Wk(i, n, r), Xu(e, t, s), o.formatContext = i, n) {
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "img":
      case "input":
      case "keygen":
      case "link":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
        break;
      default:
        o.chunks.push(Xk, q(n), Jk);
    }
    o.lastPushedText = !1;
  } else {
    switch (n) {
      case YS:
      case KS:
      case Eg:
      case jg:
      case Cg:
        gt(e, t, r.children);
        return;
      case Og:
        gt(e, t, r.children);
        return;
      case QS:
        throw Error(X(343));
      case Ng:
        e: {
          n = t.blockedBoundary, o = t.blockedSegment, s = r.fallback, r = r.children, i = /* @__PURE__ */ new Set();
          var a = { id: null, rootSegmentID: -1, parentFlushed: !1, pendingTasks: 0, forceClientRender: !1, completedSegments: [], byteSize: 0, fallbackAbortableTasks: i, errorDigest: null }, l = la(e, o.chunks.length, a, o.formatContext, !1, !1);
          o.children.push(l), o.lastPushedText = !1;
          var u = la(e, 0, null, o.formatContext, !1, !1);
          u.parentFlushed = !0, t.blockedBoundary = a, t.blockedSegment = u;
          try {
            if (Xu(
              e,
              t,
              r
            ), u.lastPushedText && u.textEmbedded && u.chunks.push(ud), u.status = 1, ca(a, u), a.pendingTasks === 0) break e;
          } catch (c) {
            u.status = 4, a.forceClientRender = !0, a.errorDigest = ms(e, c);
          } finally {
            t.blockedBoundary = n, t.blockedSegment = o;
          }
          t = hd(e, s, n, l, i, t.legacyContext, t.context, t.treeContext), e.pingedTasks.push(t);
        }
        return;
    }
    if (typeof n == "object" && n !== null) switch (n.$$typeof) {
      case Tg:
        if (r = Kp(e, t, n.render, r, o), hs !== 0) {
          n = t.treeContext, t.treeContext = Yu(n, 1, 0);
          try {
            gt(e, t, r);
          } finally {
            t.treeContext = n;
          }
        } else gt(e, t, r);
        return;
      case Pg:
        n = n.type, r = Gp(n, r), Gu(e, t, n, r, o);
        return;
      case $g:
        if (o = r.children, n = n._context, r = r.value, s = n._currentValue, n._currentValue = r, i = cr, cr = r = { parent: i, depth: i === null ? 0 : i.depth + 1, context: n, parentValue: s, value: r }, t.context = r, gt(e, t, o), e = cr, e === null) throw Error(X(403));
        r = e.parentValue, e.context._currentValue = r === GS ? e.context._defaultValue : r, e = cr = e.parent, t.context = e;
        return;
      case Ig:
        r = r.children, r = r(n._currentValue), gt(e, t, r);
        return;
      case cd:
        o = n._init, n = o(n._payload), r = Gp(n, r), Gu(e, t, n, r, void 0);
        return;
    }
    throw Error(X(
      130,
      n == null ? n : typeof n,
      ""
    ));
  }
}
function gt(e, t, n) {
  if (t.node = n, typeof n == "object" && n !== null) {
    switch (n.$$typeof) {
      case ZS:
        Gu(e, t, n.type, n.props, n.ref);
        return;
      case _g:
        throw Error(X(257));
      case cd:
        var r = n._init;
        n = r(n._payload), gt(e, t, n);
        return;
    }
    if (Qu(n)) {
      Xp(e, t, n);
      return;
    }
    if (n === null || typeof n != "object" ? r = null : (r = Fp && n[Fp] || n["@@iterator"], r = typeof r == "function" ? r : null), r && (r = r.call(n))) {
      if (n = r.next(), !n.done) {
        var o = [];
        do
          o.push(n.value), n = r.next();
        while (!n.done);
        Xp(e, t, o);
      }
      return;
    }
    throw e = Object.prototype.toString.call(n), Error(X(31, e === "[object Object]" ? "object with keys {" + Object.keys(n).join(", ") + "}" : e));
  }
  typeof n == "string" ? (r = t.blockedSegment, r.lastPushedText = Pp(t.blockedSegment.chunks, n, e.responseState, r.lastPushedText)) : typeof n == "number" && (r = t.blockedSegment, r.lastPushedText = Pp(t.blockedSegment.chunks, "" + n, e.responseState, r.lastPushedText));
}
function Xp(e, t, n) {
  for (var r = n.length, o = 0; o < r; o++) {
    var s = t.treeContext;
    t.treeContext = Yu(s, r, o);
    try {
      Xu(e, t, n[o]);
    } finally {
      t.treeContext = s;
    }
  }
}
function Xu(e, t, n) {
  var r = t.blockedSegment.formatContext, o = t.legacyContext, s = t.context;
  try {
    return gt(e, t, n);
  } catch (l) {
    if (pd(), typeof l == "object" && l !== null && typeof l.then == "function") {
      n = l;
      var i = t.blockedSegment, a = la(e, i.chunks.length, null, i.formatContext, i.lastPushedText, !0);
      i.children.push(a), i.lastPushedText = !1, e = hd(e, t.node, t.blockedBoundary, a, t.abortSet, t.legacyContext, t.context, t.treeContext).ping, n.then(e, e), t.blockedSegment.formatContext = r, t.legacyContext = o, t.context = s, ia(s);
    } else throw t.blockedSegment.formatContext = r, t.legacyContext = o, t.context = s, ia(s), l;
  }
}
function ab(e) {
  var t = e.blockedBoundary;
  e = e.blockedSegment, e.status = 3, Bg(this, t, e);
}
function Fg(e, t, n) {
  var r = e.blockedBoundary;
  e.blockedSegment.status = 3, r === null ? (t.allPendingTasks--, t.status !== 2 && (t.status = 2, t.destination !== null && t.destination.close())) : (r.pendingTasks--, r.forceClientRender || (r.forceClientRender = !0, e = n === void 0 ? Error(X(432)) : n, r.errorDigest = t.onError(e), r.parentFlushed && t.clientRenderedBoundaries.push(r)), r.fallbackAbortableTasks.forEach(function(o) {
    return Fg(o, t, n);
  }), r.fallbackAbortableTasks.clear(), t.allPendingTasks--, t.allPendingTasks === 0 && (r = t.onAllReady, r()));
}
function ca(e, t) {
  if (t.chunks.length === 0 && t.children.length === 1 && t.children[0].boundary === null) {
    var n = t.children[0];
    n.id = t.id, n.parentFlushed = !0, n.status === 1 && ca(e, n);
  } else e.completedSegments.push(t);
}
function Bg(e, t, n) {
  if (t === null) {
    if (n.parentFlushed) {
      if (e.completedRootSegment !== null) throw Error(X(389));
      e.completedRootSegment = n;
    }
    e.pendingRootTasks--, e.pendingRootTasks === 0 && (e.onShellError = Po, t = e.onShellReady, t());
  } else t.pendingTasks--, t.forceClientRender || (t.pendingTasks === 0 ? (n.parentFlushed && n.status === 1 && ca(t, n), t.parentFlushed && e.completedBoundaries.push(t), t.fallbackAbortableTasks.forEach(ab, e), t.fallbackAbortableTasks.clear()) : n.parentFlushed && n.status === 1 && (ca(t, n), t.completedSegments.length === 1 && t.parentFlushed && e.partialBoundaries.push(t)));
  e.allPendingTasks--, e.allPendingTasks === 0 && (e = e.onAllReady, e());
}
function Vg(e) {
  if (e.status !== 2) {
    var t = cr, n = Ml.current;
    Ml.current = Qp;
    var r = wi;
    wi = e.responseState;
    try {
      var o = e.pingedTasks, s;
      for (s = 0; s < o.length; s++) {
        var i = o[s], a = e, l = i.blockedSegment;
        if (l.status === 0) {
          ia(i.context);
          try {
            gt(a, i, i.node), l.lastPushedText && l.textEmbedded && l.chunks.push(ud), i.abortSet.delete(i), l.status = 1, Bg(a, i.blockedBoundary, l);
          } catch (x) {
            if (pd(), typeof x == "object" && x !== null && typeof x.then == "function") {
              var u = i.ping;
              x.then(u, u);
            } else {
              i.abortSet.delete(i), l.status = 4;
              var c = i.blockedBoundary, p = x, g = ms(a, p);
              if (c === null ? ua(a, p) : (c.pendingTasks--, c.forceClientRender || (c.forceClientRender = !0, c.errorDigest = g, c.parentFlushed && a.clientRenderedBoundaries.push(c))), a.allPendingTasks--, a.allPendingTasks === 0) {
                var w = a.onAllReady;
                w();
              }
            }
          } finally {
          }
        }
      }
      o.splice(0, s), e.destination !== null && md(e, e.destination);
    } catch (x) {
      ms(e, x), ua(e, x);
    } finally {
      wi = r, Ml.current = n, n === Qp && ia(t);
    }
  }
}
function Gs(e, t, n) {
  switch (n.parentFlushed = !0, n.status) {
    case 0:
      var r = n.id = e.nextSegmentId++;
      return n.lastPushedText = !1, n.textEmbedded = !1, e = e.responseState, F(t, qk), F(t, e.placeholderPrefix), e = q(r.toString(16)), F(t, e), me(t, eS);
    case 1:
      n.status = 2;
      var o = !0;
      r = n.chunks;
      var s = 0;
      n = n.children;
      for (var i = 0; i < n.length; i++) {
        for (o = n[i]; s < o.index; s++) F(t, r[s]);
        o = Pa(e, t, o);
      }
      for (; s < r.length - 1; s++) F(t, r[s]);
      return s < r.length && (o = me(t, r[s])), o;
    default:
      throw Error(X(390));
  }
}
function Pa(e, t, n) {
  var r = n.boundary;
  if (r === null) return Gs(e, t, n);
  if (r.parentFlushed = !0, r.forceClientRender) r = r.errorDigest, me(t, oS), F(t, iS), r && (F(t, lS), F(t, q(Re(r))), F(t, aS)), me(t, uS), Gs(e, t, n);
  else if (0 < r.pendingTasks) {
    r.rootSegmentID = e.nextSegmentId++, 0 < r.completedSegments.length && e.partialBoundaries.push(r);
    var o = e.responseState, s = o.nextSuspenseID++;
    o = P(o.boundaryPrefix + s.toString(16)), r = r.id = o, Lp(t, e.responseState, r), Gs(e, t, n);
  } else if (r.byteSize > e.progressiveChunkSize) r.rootSegmentID = e.nextSegmentId++, e.completedBoundaries.push(r), Lp(t, e.responseState, r.id), Gs(e, t, n);
  else {
    if (me(t, tS), n = r.completedSegments, n.length !== 1) throw Error(X(391));
    Pa(e, t, n[0]);
  }
  return me(t, sS);
}
function Jp(e, t, n) {
  return NS(t, e.responseState, n.formatContext, n.id), Pa(e, t, n), OS(t, n.formatContext);
}
function qp(e, t, n) {
  for (var r = n.completedSegments, o = 0; o < r.length; o++) Ug(e, t, n, r[o]);
  if (r.length = 0, e = e.responseState, r = n.id, n = n.rootSegmentID, F(t, e.startInlineScript), e.sentCompleteBoundaryFunction ? F(t, AS) : (e.sentCompleteBoundaryFunction = !0, F(t, zS)), r === null) throw Error(X(395));
  return n = q(n.toString(16)), F(t, r), F(t, LS), F(t, e.segmentPrefix), F(t, n), me(t, FS);
}
function Ug(e, t, n, r) {
  if (r.status === 2) return !0;
  var o = r.id;
  if (o === -1) {
    if ((r.id = n.rootSegmentID) === -1) throw Error(X(392));
    return Jp(e, t, r);
  }
  return Jp(e, t, r), e = e.responseState, F(t, e.startInlineScript), e.sentCompleteSegmentFunction ? F(t, MS) : (e.sentCompleteSegmentFunction = !0, F(t, PS)), F(t, e.segmentPrefix), o = q(o.toString(16)), F(t, o), F(t, RS), F(t, e.placeholderPrefix), F(t, o), me(t, DS);
}
function md(e, t) {
  mt = new Uint8Array(512), yt = 0;
  try {
    var n = e.completedRootSegment;
    if (n !== null && e.pendingRootTasks === 0) {
      Pa(e, t, n), e.completedRootSegment = null;
      var r = e.responseState.bootstrapChunks;
      for (n = 0; n < r.length - 1; n++) F(t, r[n]);
      n < r.length && me(t, r[n]);
    }
    var o = e.clientRenderedBoundaries, s;
    for (s = 0; s < o.length; s++) {
      var i = o[s];
      r = t;
      var a = e.responseState, l = i.id, u = i.errorDigest, c = i.errorMessage, p = i.errorComponentStack;
      if (F(r, a.startInlineScript), a.sentClientRenderFunction ? F(r, VS) : (a.sentClientRenderFunction = !0, F(
        r,
        BS
      )), l === null) throw Error(X(395));
      F(r, l), F(r, US), (u || c || p) && (F(r, Ol), F(r, q(Pl(u || "")))), (c || p) && (F(r, Ol), F(r, q(Pl(c || "")))), p && (F(r, Ol), F(r, q(Pl(p)))), me(r, WS);
    }
    o.splice(0, s);
    var g = e.completedBoundaries;
    for (s = 0; s < g.length; s++) qp(e, t, g[s]);
    g.splice(0, s), Ip(t), mt = new Uint8Array(512), yt = 0;
    var w = e.partialBoundaries;
    for (s = 0; s < w.length; s++) {
      var x = w[s];
      e: {
        o = e, i = t;
        var k = x.completedSegments;
        for (a = 0; a < k.length; a++) if (!Ug(
          o,
          i,
          x,
          k[a]
        )) {
          a++, k.splice(0, a);
          var b = !1;
          break e;
        }
        k.splice(0, a), b = !0;
      }
      if (!b) {
        e.destination = null, s++, w.splice(0, s);
        return;
      }
    }
    w.splice(0, s);
    var v = e.completedBoundaries;
    for (s = 0; s < v.length; s++) qp(e, t, v[s]);
    v.splice(0, s);
  } finally {
    Ip(t), e.allPendingTasks === 0 && e.pingedTasks.length === 0 && e.clientRenderedBoundaries.length === 0 && e.completedBoundaries.length === 0 && t.close();
  }
}
function eh(e, t) {
  try {
    var n = e.abortableTasks;
    n.forEach(function(r) {
      return Fg(r, e, t);
    }), n.clear(), e.destination !== null && md(e, e.destination);
  } catch (r) {
    ms(e, r), ua(e, r);
  }
}
id.renderToReadableStream = function(e, t) {
  return new Promise(function(n, r) {
    var o, s, i = new Promise(function(c, p) {
      s = c, o = p;
    }), a = ib(e, Vk(t ? t.identifierPrefix : void 0, t ? t.nonce : void 0, t ? t.bootstrapScriptContent : void 0, t ? t.bootstrapScripts : void 0, t ? t.bootstrapModules : void 0), Uk(t ? t.namespaceURI : void 0), t ? t.progressiveChunkSize : void 0, t ? t.onError : void 0, s, function() {
      var c = new ReadableStream({ type: "bytes", pull: function(p) {
        if (a.status === 1) a.status = 2, kg(p, a.fatalError);
        else if (a.status !== 2 && a.destination === null) {
          a.destination = p;
          try {
            md(a, p);
          } catch (g) {
            ms(a, g), ua(a, g);
          }
        }
      }, cancel: function() {
        eh(a);
      } }, { highWaterMark: 0 });
      c.allReady = i, n(c);
    }, function(c) {
      i.catch(function() {
      }), r(c);
    }, o);
    if (t && t.signal) {
      var l = t.signal, u = function() {
        eh(a, l.reason), l.removeEventListener("abort", u);
      };
      l.addEventListener("abort", u);
    }
    Vg(a);
  });
};
id.version = "18.3.1";
var fo, Wg;
fo = co, Wg = id;
fo.version;
fo.renderToString;
var lb = fo.renderToStaticMarkup;
fo.renderToNodeStream;
fo.renderToStaticNodeStream;
Wg.renderToReadableStream;
const th = { cone: 0, player: 1, ball: 2 };
function yd({ board: e, t = 0, easing: n = "easeInOut", width: r = "100%", height: o = "100%", className: s, background: i }) {
  const a = { viewport: e.pitch.viewport, orientation: e.pitch.orientation }, l = ja(a), u = Gc(e, t, Ny[n]), c = Math.min(Math.floor(Math.max(0, t)), e.steps.length - 1), p = e.steps[c]?.drawings ?? [], g = [...e.objects].sort((w, x) => th[w.type] - th[x.type]);
  return /* @__PURE__ */ d.jsxs("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: `0 0 ${l.width} ${l.height}`, width: r, height: o, className: s, preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": `${e.metadata.name} — step ${c + 1}`, children: [
    i && /* @__PURE__ */ d.jsx("rect", { x: 0, y: 0, width: l.width, height: l.height, fill: i }),
    /* @__PURE__ */ d.jsx(Hy, { pitch: e.pitch, frame: a }),
    /* @__PURE__ */ d.jsx("g", { "data-layer": "drawings", children: p.map((w) => /* @__PURE__ */ d.jsx(Lu, { drawing: w, path: On(w, u), frame: a, colours: e.teamColours, selected: !1, zoom: 1 }, w.id)) }),
    /* @__PURE__ */ d.jsx("g", { "data-layer": "objects", children: g.map((w) => {
      const x = u[w.id];
      return x ? /* @__PURE__ */ d.jsx(Zy, { object: w, position: Vt(x, a), z: x.z ?? 0, selected: !1, dragging: !1, colours: e.teamColours, onPointerDown: () => {
      } }, w.id) : null;
    }) })
  ] });
}
function ub(e, t = 0, n = "easeInOut", r) {
  const o = r ?? ja({ viewport: e.pitch.viewport, orientation: e.pitch.orientation });
  return lb(/* @__PURE__ */ d.jsx(yd, { board: e, t, easing: n, width: o.width, height: o.height, background: "#1f2937" })).replace(/var\(--tb-grass,\s*([^)]+)\)/g, "$1").replace(/var\(--tb-line,\s*([^)]+)\)/g, "$1").replace(/var\(--tb-selection,\s*([^)]+)\)/g, "$1").replace(/var\(--tb-neutral1,\s*([^)]+)\)/g, "$1").replace(/var\(--tb-neutral2,\s*([^)]+)\)/g, "$1").replace(/var\(--tb-neutral3,\s*([^)]+)\)/g, "$1").replace(/var\(--tb-ball,\s*([^)]+)\)/g, "$1");
}
async function cb(e, t = {}) {
  const n = { viewport: e.pitch.viewport, orientation: e.pitch.orientation }, r = ja(n), s = (t.maxSide ?? 2e3) / Math.max(r.width, r.height), i = Math.round(r.width * s), a = Math.round(r.height * s), l = ub(e, t.t ?? 0, t.easing ?? "easeInOut", { width: i, height: a }), u = URL.createObjectURL(new Blob([l], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const c = await new Promise((w, x) => {
      const k = new Image();
      k.onload = () => w(k), k.onerror = () => x(new Error("Could not render board image")), k.src = u;
    }), p = document.createElement("canvas");
    p.width = i, p.height = a;
    const g = p.getContext("2d");
    if (!g) throw new Error("Canvas unavailable");
    return g.drawImage(c, 0, 0, i, a), await new Promise((w, x) => p.toBlob((k) => k ? w(k) : x(new Error("PNG encode failed")), "image/png"));
  } finally {
    URL.revokeObjectURL(u);
  }
}
function nh(e, t, n) {
  const r = e.metadata.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "tactic";
  return n === void 0 ? `${r}.${t}` : `${r}-step-${n + 1}.${t}`;
}
const Ma = $.createContext(Sy());
function db({ host: e, children: t }) {
  return /* @__PURE__ */ d.jsx(Ma.Provider, { value: e, children: t });
}
function gd() {
  return $.useContext(Ma);
}
function vd() {
  return $.useContext(Ma).capabilities;
}
function Db() {
  return $.useContext(Ma).capabilities.editBoard;
}
function fb(e, t = Date.now()) {
  const n = Math.max(0, t - new Date(e).getTime()), r = Math.floor(n / 6e4);
  if (r < 1) return "just now";
  if (r < 60) return `${r} min ago`;
  const o = Math.floor(r / 60);
  if (o < 24) return `${o} h ago`;
  const s = Math.floor(o / 24);
  return s < 7 ? `${s} d ago` : new Date(e).toLocaleDateString();
}
function pb(e) {
  const t = vd(), [n, r] = $.useState("recent"), [o, s] = $.useState(""), i = $.useMemo(() => {
    const a = o.trim().toLowerCase();
    let l = [...e.boards].sort((u, c) => c.updatedAt.localeCompare(u.updatedAt));
    return n === "favourites" && (l = l.filter((u) => u.favourite)), a && (l = l.filter((u) => u.name.toLowerCase().includes(a) || u.description.toLowerCase().includes(a))), n === "recent" && !a && (l = l.slice(0, 8)), l;
  }, [e.boards, n, o]);
  return /* @__PURE__ */ d.jsxs("div", { className: "lib", children: [
    /* @__PURE__ */ d.jsxs("header", { className: "lib-head", children: [
      /* @__PURE__ */ d.jsxs("div", { children: [
        /* @__PURE__ */ d.jsx("h1", { className: "lib-title", children: "Coach's Eye Tactics" }),
        /* @__PURE__ */ d.jsx("p", { className: "lib-sub", children: "Your tactical notebook — tactics and drills that animate." })
      ] }),
      t.createBoard && /* @__PURE__ */ d.jsxs("div", { className: "lib-actions", children: [
        /* @__PURE__ */ d.jsx("button", { type: "button", className: "lib-primary", onClick: e.onQuickStart, "aria-label": "New tactic", children: "+ New Tactic" }),
        /* @__PURE__ */ d.jsx("button", { type: "button", onClick: e.onNew, "aria-label": "New board", children: "New Board…" })
      ] })
    ] }),
    e.error && /* @__PURE__ */ d.jsx("div", { role: "alert", className: "lib-alert", children: e.error }),
    e.corrupt.length > 0 && /* @__PURE__ */ d.jsxs("div", { role: "status", "data-testid": "corrupt-notice", className: "lib-alert lib-alert-warn", children: [
      e.corrupt.length,
      " saved board",
      e.corrupt.length > 1 ? "s" : "",
      " couldn't be read and ",
      e.corrupt.length > 1 ? "were" : "was",
      " set aside (nothing was deleted). Reference: ",
      e.corrupt.map((a) => a.id).join(", "),
      "."
    ] }),
    e.loading ? /* @__PURE__ */ d.jsx("div", { className: "lib-loading", role: "status", children: "Loading your boards…" }) : e.boards.length === 0 ? /* @__PURE__ */ d.jsxs("div", { className: "lib-empty", "data-testid": "library-empty", children: [
      /* @__PURE__ */ d.jsx("div", { className: "lib-empty-art", "aria-hidden": "true", children: "🏉" }),
      /* @__PURE__ */ d.jsx("h2", { children: "No tactics yet" }),
      /* @__PURE__ */ d.jsx("p", { children: t.createBoard ? "Create your first tactic or drill. Place players, draw the move, press Play." : "Nothing has been shared with you yet." }),
      t.createBoard && /* @__PURE__ */ d.jsxs("div", { className: "lib-actions", children: [
        /* @__PURE__ */ d.jsx("button", { type: "button", className: "lib-primary", onClick: e.onQuickStart, children: "+ New Tactic" }),
        /* @__PURE__ */ d.jsx("button", { type: "button", onClick: e.onNew, children: "Start from a template" })
      ] })
    ] }) : /* @__PURE__ */ d.jsxs(d.Fragment, { children: [
      /* @__PURE__ */ d.jsxs("nav", { className: "lib-filters", "aria-label": "Library filter", children: [
        ["recent", "all", "favourites"].map((a) => /* @__PURE__ */ d.jsx("button", { type: "button", role: "tab", "aria-selected": n === a, onClick: () => r(a), children: a === "recent" ? "Recent" : a === "all" ? `All (${e.boards.length})` : `Favourites (${e.boards.filter((l) => l.favourite).length})` }, a)),
        /* @__PURE__ */ d.jsx("input", { "aria-label": "Search boards", placeholder: "Search…", value: o, onChange: (a) => s(a.target.value), className: "lib-search" })
      ] }),
      i.length === 0 ? /* @__PURE__ */ d.jsx("p", { className: "lib-none", children: n === "favourites" ? "No favourites yet — tap ☆ on a board to keep it here." : "No boards match." }) : /* @__PURE__ */ d.jsx("div", { className: "lib-grid", "data-testid": "board-grid", children: i.map((a) => /* @__PURE__ */ d.jsx(hb, { caps: t, summary: a, board: e.previews[a.id], onOpen: () => e.onOpen(a.id), onPresent: () => e.onPresent(a.id), onRename: (l) => e.onRename(a.id, l), onDuplicate: () => e.onDuplicate(a.id), onFavourite: (l) => e.onFavourite(a.id, l), onDelete: () => e.onDelete(a.id) }, a.id)) })
    ] })
  ] });
}
function hb({ caps: e, summary: t, board: n, onOpen: r, onPresent: o, onRename: s, onDuplicate: i, onFavourite: a, onDelete: l }) {
  const [u, c] = $.useState(!1), [p, g] = $.useState(!1), [w, x] = $.useState(!1), [k, b] = $.useState(t.name), v = $.useRef(null);
  $.useEffect(() => b(t.name), [t.name]), $.useEffect(() => {
    if (!u) return;
    const m = (S) => {
      v.current?.contains(S.target) || c(!1);
    };
    return document.addEventListener("mousedown", m), () => document.removeEventListener("mousedown", m);
  }, [u]);
  const f = () => {
    g(!1), k.trim() && k.trim() !== t.name ? s(k.trim()) : b(t.name);
  };
  return /* @__PURE__ */ d.jsxs("article", { className: "card", "data-testid": `board-card-${t.id}`, "aria-label": t.name, children: [
    /* @__PURE__ */ d.jsx("button", { type: "button", className: "card-preview", onClick: r, "aria-label": `Open ${t.name}`, children: n ? /* @__PURE__ */ d.jsx(yd, { board: n, t: 0 }) : /* @__PURE__ */ d.jsx("div", { className: "card-preview-empty", "aria-hidden": "true" }) }),
    /* @__PURE__ */ d.jsxs("div", { className: "card-body", children: [
      p ? /* @__PURE__ */ d.jsx("input", { autoFocus: !0, "aria-label": "Rename board", value: k, maxLength: 60, onChange: (m) => b(m.target.value), onBlur: f, onKeyDown: (m) => {
        m.key === "Enter" && f(), m.key === "Escape" && (b(t.name), g(!1));
      } }) : /* @__PURE__ */ d.jsx("button", { type: "button", className: "card-name", onClick: r, title: t.name, children: t.name }),
      /* @__PURE__ */ d.jsxs("div", { className: "card-meta", children: [
        /* @__PURE__ */ d.jsx("span", { className: `card-kind card-kind-${t.kind}`, children: t.kind === "tactic" ? "Tactic" : "Drill" }),
        /* @__PURE__ */ d.jsxs("span", { children: [
          t.stepCount,
          " step",
          t.stepCount === 1 ? "" : "s"
        ] }),
        /* @__PURE__ */ d.jsx("span", { title: new Date(t.updatedAt).toLocaleString(), children: fb(t.updatedAt) })
      ] })
    ] }),
    /* @__PURE__ */ d.jsxs("div", { className: "card-actions", children: [
      /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": t.favourite ? `Unfavourite ${t.name}` : `Favourite ${t.name}`, "aria-pressed": t.favourite, onClick: () => a(!t.favourite), className: "card-fav", style: { color: t.favourite ? "#fbbf24" : void 0 }, children: t.favourite ? "★" : "☆" }),
      /* @__PURE__ */ d.jsxs("div", { className: "tb-menu", ref: v, children: [
        /* @__PURE__ */ d.jsx("button", { type: "button", "aria-label": `More actions for ${t.name}`, "aria-haspopup": "menu", "aria-expanded": u, onClick: () => {
          c((m) => !m), x(!1);
        }, children: "⋯" }),
        u && /* @__PURE__ */ d.jsxs("div", { role: "menu", className: "tb-menu-list", children: [
          /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", onClick: () => {
            c(!1), r();
          }, children: "Open" }),
          /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", onClick: () => {
            c(!1), o();
          }, children: "Present" }),
          e.editBoard && /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", onClick: () => {
            c(!1), g(!0);
          }, children: "Rename" }),
          e.createBoard && /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", onClick: () => {
            c(!1), i();
          }, children: "Duplicate" }),
          /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", onClick: () => {
            c(!1), a(!t.favourite);
          }, children: t.favourite ? "Unfavourite" : "Favourite" }),
          e.deleteBoard && (w ? /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", className: "danger", onClick: () => {
            c(!1), l();
          }, "aria-label": `Confirm delete ${t.name}`, children: "Delete permanently?" }) : /* @__PURE__ */ d.jsx("button", { type: "button", role: "menuitem", className: "danger", onClick: () => x(!0), children: "Delete…" }))
        ] })
      ] })
    ] })
  ] });
}
const mb = { attack: "Attack", defence: "Defence", kicking: "Kicking", drill: "Drills" };
function yb({ onCreate: e, onCancel: t }) {
  const n = gd(), [r, o] = $.useState("tactic"), [s, i] = $.useState(""), [a, l] = $.useState("half"), [u, c] = $.useState("portrait"), [p, g] = $.useState(null), w = $.useMemo(() => Object.fromEntries(wl.map((b) => [b.id, Wy(b.id)])), []), x = $.useMemo(() => {
    var v;
    const b = {};
    for (const f of wl) (b[v = f.category] ?? (b[v] = [])).push(f);
    return b;
  }, []), k = p ? wl.find((b) => b.id === p).name : Dy[r];
  return /* @__PURE__ */ d.jsxs(
    "form",
    {
      className: "newb",
      onSubmit: (b) => {
        b.preventDefault(), e({ kind: r, name: s.trim() || k, preset: a, orientation: u, templateId: p });
      },
      children: [
        /* @__PURE__ */ d.jsxs("header", { className: "lib-head", children: [
          /* @__PURE__ */ d.jsxs("div", { children: [
            /* @__PURE__ */ d.jsx("h1", { className: "lib-title", children: "New board" }),
            /* @__PURE__ */ d.jsxs("p", { className: "lib-sub", children: [
              "Start blank or from a template. You can change everything later.",
              n.scope.group ? ` This board will belong to ${n.scope.group.name}.` : ""
            ] })
          ] }),
          /* @__PURE__ */ d.jsxs("div", { className: "lib-actions", children: [
            /* @__PURE__ */ d.jsx("button", { type: "button", onClick: t, children: "Cancel" }),
            /* @__PURE__ */ d.jsx("button", { type: "submit", className: "lib-primary", "aria-label": "Create board", children: "Create" })
          ] })
        ] }),
        /* @__PURE__ */ d.jsxs("div", { className: "newb-grid", children: [
          /* @__PURE__ */ d.jsxs("section", { className: "newb-fields", children: [
            /* @__PURE__ */ d.jsxs("label", { children: [
              "Type",
              /* @__PURE__ */ d.jsx("div", { role: "radiogroup", "aria-label": "Board type", className: "seg", children: ["tactic", "drill"].map((b) => /* @__PURE__ */ d.jsx("button", { type: "button", role: "radio", "aria-checked": r === b, onClick: () => o(b), children: b === "tactic" ? "Tactic" : "Drill" }, b)) })
            ] }),
            /* @__PURE__ */ d.jsxs("label", { children: [
              "Name",
              /* @__PURE__ */ d.jsx("input", { "aria-label": "Board name", value: s, maxLength: 60, placeholder: k, onChange: (b) => i(b.target.value) })
            ] }),
            /* @__PURE__ */ d.jsxs("label", { children: [
              "Pitch",
              /* @__PURE__ */ d.jsxs("select", { "aria-label": "Pitch", value: a, onChange: (b) => l(b.target.value), disabled: !!p, children: [
                /* @__PURE__ */ d.jsx("option", { value: "full", children: "Full pitch" }),
                /* @__PURE__ */ d.jsx("option", { value: "half", children: "Half pitch" }),
                /* @__PURE__ */ d.jsx("option", { value: "twentyTwo", children: "22 area" }),
                /* @__PURE__ */ d.jsx("option", { value: "grid", children: "Grid (drills)" })
              ] })
            ] }),
            /* @__PURE__ */ d.jsxs("label", { children: [
              "Orientation",
              /* @__PURE__ */ d.jsx("div", { role: "radiogroup", "aria-label": "Orientation", className: "seg", children: ["portrait", "landscape"].map((b) => /* @__PURE__ */ d.jsx("button", { type: "button", role: "radio", "aria-checked": u === b, onClick: () => c(b), children: b === "portrait" ? "Portrait" : "Landscape" }, b)) })
            ] })
          ] }),
          /* @__PURE__ */ d.jsxs("section", { className: "newb-templates", "aria-label": "Starting template", children: [
            /* @__PURE__ */ d.jsx("h2", { children: "Start from" }),
            /* @__PURE__ */ d.jsxs("div", { className: "tpl-grid", role: "radiogroup", "aria-label": "Template", children: [
              /* @__PURE__ */ d.jsxs("button", { type: "button", role: "radio", "aria-checked": p === null, className: "tpl", onClick: () => g(null), children: [
                /* @__PURE__ */ d.jsx("div", { className: "tpl-blank", "aria-hidden": "true", children: "Blank" }),
                /* @__PURE__ */ d.jsx("div", { className: "tpl-name", children: "Blank board" }),
                /* @__PURE__ */ d.jsx("div", { className: "tpl-desc", children: "Empty pitch, one step." })
              ] }),
              Object.entries(x).map(([b, v]) => v.map((f) => /* @__PURE__ */ d.jsxs("button", { type: "button", role: "radio", "aria-checked": p === f.id, className: "tpl", onClick: () => {
                g(f.id), o(f.kind);
              }, "data-testid": `template-${f.id}`, children: [
                /* @__PURE__ */ d.jsx("div", { className: "tpl-preview", "aria-hidden": "true", children: /* @__PURE__ */ d.jsx(yd, { board: w[f.id], t: 0 }) }),
                /* @__PURE__ */ d.jsxs("div", { className: "tpl-name", children: [
                  f.name,
                  " ",
                  /* @__PURE__ */ d.jsx("span", { className: "tpl-cat", children: mb[b] })
                ] }),
                /* @__PURE__ */ d.jsx("div", { className: "tpl-desc", children: f.description })
              ] }, f.id)))
            ] })
          ] })
        ] })
      ]
    }
  );
}
function gb(e) {
  const t = e.replace(/^#/, "");
  if (t === "/new") return { view: "new" };
  const n = /^\/board\/([^/]+)(\/present)?$/.exec(t);
  return n ? { view: "board", id: decodeURIComponent(n[1]), present: !!n[2] } : { view: "home" };
}
function vb(e) {
  return e.view === "new" ? "#/new" : e.view === "board" ? `#/board/${encodeURIComponent(e.id)}${e.present ? "/present" : ""}` : "#/";
}
function xb(e = window) {
  return {
    get: () => gb(e.location.hash),
    set: (t) => {
      const n = vb(t);
      e.location.hash !== n && (e.location.hash = n);
    },
    subscribe: (t) => (e.addEventListener("hashchange", t), () => e.removeEventListener("hashchange", t))
  };
}
function wb(e = { view: "home" }, t) {
  let n = e;
  const r = /* @__PURE__ */ new Set();
  return {
    get: () => n,
    set: (o) => {
      n = o, t?.(o), r.forEach((s) => s());
    },
    subscribe: (o) => (r.add(o), () => r.delete(o))
  };
}
function kb(e) {
  const [t, n] = $.useState(() => e.get());
  return $.useEffect(() => {
    const r = () => n(e.get());
    return r(), e.subscribe(r);
  }, [e]), [t, (r) => e.set(r)];
}
function Sb({ persistence: e, routeSource: t, download: n }) {
  const r = gd(), o = vd(), [s, i] = kb(t), [a, l] = $.useState(null), [u, c] = $.useState({}), [p, g] = $.useState([]), [w, x] = $.useState(void 0), k = $.useCallback(async () => {
    try {
      const m = await e.list();
      l(m), g(await e.listCorrupt());
      const S = await e.loadMany(m.slice(0, 24).map((_) => _.id));
      c(Object.fromEntries(S.map((_) => [_.id, _]))), x(void 0);
    } catch (m) {
      l([]), x("Your saved boards couldn't be loaded."), console.error(m);
    }
  }, [e]);
  $.useEffect(() => {
    s.view !== "board" && k();
  }, [s.view, k]);
  const b = $.useCallback(
    async (m) => {
      if (!o.createBoard) return;
      let S;
      if (m.templateId) {
        const _ = Wy(m.templateId);
        S = _ ? lw(_, { name: m.name, kind: m.kind }) : Du({ name: m.name, kind: m.kind }), S.pitch = { ...S.pitch, orientation: m.orientation };
      } else
        S = Du({ name: m.name, kind: m.kind, preset: m.preset, orientation: m.orientation }), S.pitch.viewport = Kc(S.pitch, m.preset);
      S.metadata.ownerUserId = r.user.id, r.scope.club.id !== "local" && (S.metadata.clubId = r.scope.club.id, r.scope.group && (S.metadata.groupId = r.scope.group.id), r.scope.team && (S.metadata.teamId = r.scope.team.id)), await e.save(S), i({ view: "board", id: S.id, present: !1 });
    },
    [e, o.createBoard, r, i]
  ), v = () => void b({ kind: "tactic", name: "", preset: "half", orientation: "portrait", templateId: null }), f = async (m, S) => {
    const _ = await e.load(m);
    _ && (await e.save(S({ ..._, metadata: { ..._.metadata, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } })), await k());
  };
  return s.view === "new" ? /* @__PURE__ */ d.jsx(yb, { onCreate: (m) => void b(m), onCancel: () => i({ view: "home" }) }) : s.view === "board" ? /* @__PURE__ */ d.jsx(bb, { id: s.id, present: s.present, persistence: e, download: n, setRoute: i }, s.id) : /* @__PURE__ */ d.jsx(
    pb,
    {
      loading: a === null,
      boards: a ?? [],
      previews: u,
      corrupt: p,
      error: w,
      onOpen: (m) => i({ view: "board", id: m, present: !1 }),
      onPresent: (m) => i({ view: "board", id: m, present: !0 }),
      onQuickStart: v,
      onNew: () => i({ view: "new" }),
      onRename: (m, S) => void f(m, (_) => ({ ..._, metadata: { ..._.metadata, name: S } })),
      onFavourite: (m, S) => void f(m, (_) => ({ ..._, metadata: { ..._.metadata, favourite: S } })),
      onDuplicate: (m) => void (async () => {
        if (!o.createBoard) return;
        const S = await e.load(m);
        S && (await e.save(Fy(S, { id: vt("board") })), await k());
      })(),
      onDelete: (m) => void (async () => {
        o.deleteBoard && (await e.remove(m), await k());
      })()
    }
  );
}
function bb({ id: e, present: t, persistence: n, download: r, setRoute: o }) {
  const s = gd(), i = vd(), [a, l] = $.useState(null), [u, c] = $.useState("idle"), p = $.useRef(null), g = $.useRef(null);
  $.useEffect(() => {
    let f = !0;
    return n.load(e).then((m) => {
      f && l(m ?? "missing");
    }), () => {
      f = !1;
    };
  }, [e, n]);
  const w = $.useCallback(async () => {
    const f = p.current;
    if (f) {
      p.current = null;
      try {
        await n.save(f), c("saved");
      } catch (m) {
        console.error(m), c("error");
      }
    }
  }, [n]), x = $.useCallback(
    (f) => {
      i.editBoard && (p.current = { ...f, metadata: { ...f.metadata, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } }, c("saving"), g.current && clearTimeout(g.current), g.current = setTimeout(() => void w(), 400));
    },
    [w, i.editBoard]
  );
  $.useEffect(() => () => {
    g.current && clearTimeout(g.current), w();
  }, [w]);
  const k = $.useCallback(
    async (f, m, S) => {
      const _ = p.current ?? m;
      if (f === "json") {
        r(new Blob([By(_)], { type: "application/json" }), nh(_, "json"));
        return;
      }
      try {
        r(await cb(_, { t: S }), nh(_, "png", S));
      } catch (T) {
        console.error(T), c("error");
      }
    },
    [r]
  ), b = $.useMemo(() => {
    const f = () => p.current ?? a, m = [];
    if (s.sharing && (i.shareToGroup || i.shareToTeam)) {
      if (i.shareToGroup && s.scope.group) {
        const S = s.scope.group;
        m.push({ id: "share-group", label: `Share with ${S.name}`, run: () => void s.sharing.share({ board: f(), audience: { kind: "group", id: S.id } }) });
      }
      if (i.shareToTeam && s.scope.team) {
        const S = s.scope.team;
        m.push({ id: "share-team", label: `Share with ${S.name}`, run: () => void s.sharing.share({ board: f(), audience: { kind: "team", id: S.id } }) });
      }
    }
    return s.sharing && i.sendMessage && m.push({ id: "share-message", label: "Send in a message", run: () => void s.sharing.share({ board: f(), audience: { kind: "message" } }) }), s.attachments && i.attachToSession && m.push({
      id: "attach-session",
      label: "Attach to a training session",
      run: () => void (async () => {
        const _ = (await s.attachments.listSessions())[0];
        if (!_) return;
        const T = f();
        await s.attachments.attachToSession(_.id, { boardId: T.id, revision: T.revision, name: T.metadata.name, attachedAt: (/* @__PURE__ */ new Date()).toISOString() });
      })()
    }), s.attachments && i.attachToMatch && m.push({
      id: "attach-match",
      label: "Attach to a match",
      run: () => void (async () => {
        const _ = (await s.attachments.listFixtures())[0];
        if (!_) return;
        const T = f();
        await s.attachments.attachToFixture(_.id, { boardId: T.id, revision: T.revision, name: T.metadata.name, attachedAt: (/* @__PURE__ */ new Date()).toISOString() });
      })()
    }), m;
  }, [s, i, a]), v = () => {
    w(), o({ view: "home" });
  };
  return a === null ? /* @__PURE__ */ d.jsx("div", { className: "lib-loading", role: "status", children: "Loading board…" }) : a === "missing" ? /* @__PURE__ */ d.jsxs("div", { className: "lib-empty", role: "alert", children: [
    /* @__PURE__ */ d.jsx("h2", { children: "Board not found" }),
    /* @__PURE__ */ d.jsx("p", { children: "It may have been deleted, or the link came from another device." }),
    /* @__PURE__ */ d.jsx("button", { type: "button", className: "lib-primary", onClick: () => o({ view: "home" }), children: "Back to library" })
  ] }) : /* @__PURE__ */ d.jsx(
    qw,
    {
      board: a,
      onChange: x,
      onBack: v,
      saveStatus: i.editBoard ? u : "idle",
      readOnly: !i.editBoard,
      onExport: (f, m, S) => void k(f, m, S),
      actions: b,
      presentOnOpen: t,
      onPresentChange: (f) => o({ view: "board", id: e, present: f })
    }
  );
}
class _b extends $.Component {
  constructor() {
    super(...arguments);
    Va(this, "state", { error: null });
    Va(this, "retry", () => {
      this.setState({ error: null }), this.props.onRetry?.();
    });
  }
  static getDerivedStateFromError(n) {
    return { error: n };
  }
  componentDidCatch(n, r) {
    console.error("[tactics-board] recovered from a crash:", n, r.componentStack);
  }
  render() {
    return this.state.error ? /* @__PURE__ */ d.jsxs("div", { className: "tb-error", role: "alert", "data-testid": "error-boundary", children: [
      /* @__PURE__ */ d.jsx("div", { style: { fontSize: 40 }, "aria-hidden": "true", children: "🏉" }),
      /* @__PURE__ */ d.jsx("h2", { children: "Something went wrong" }),
      /* @__PURE__ */ d.jsx("p", { children: "The tactics board hit a problem and stopped. Your saved boards are safe." }),
      /* @__PURE__ */ d.jsxs("div", { className: "lib-actions", children: [
        /* @__PURE__ */ d.jsx("button", { type: "button", className: "lib-primary", onClick: this.retry, children: "Try again" }),
        this.props.onExitToHost && /* @__PURE__ */ d.jsx("button", { type: "button", onClick: this.props.onExitToHost, children: "Return" })
      ] })
    ] }) : this.props.children;
  }
}
const Cb = "tb:board:", Eb = "tb:corrupt:";
function jb(e = {}) {
  const t = typeof e.getItem == "function" ? { storage: e } : e, n = t.storage ?? localStorage, r = t.namespace ? `${t.namespace}:` : "", o = Cb + r, s = Eb + r, i = (u) => Object.keys(n).filter((c) => c.startsWith(u)), a = (u, c, p) => {
    try {
      n.setItem(s + u, JSON.stringify({ raw: c, error: p, at: (/* @__PURE__ */ new Date()).toISOString() })), n.removeItem(o + u);
    } catch {
    }
  }, l = (u) => {
    const c = n.getItem(o + u);
    if (c)
      try {
        return uw(c);
      } catch (p) {
        a(u, c, p instanceof Error ? p.message : String(p));
        return;
      }
  };
  return {
    async list() {
      return i(o).map((u) => l(u.slice(o.length))).filter((u) => !!u).map(by).sort((u, c) => c.updatedAt.localeCompare(u.updatedAt));
    },
    async load(u) {
      return l(u);
    },
    async loadMany(u) {
      return u.map(l).filter((c) => !!c);
    },
    async save(u) {
      n.setItem(o + u.id, By(u, !1));
    },
    async remove(u) {
      n.removeItem(o + u);
    },
    async listCorrupt() {
      return i(s).map((u) => {
        const c = u.slice(s.length);
        try {
          const p = JSON.parse(n.getItem(u) ?? "{}");
          return { id: c, raw: p.raw ?? "", error: p.error ?? "unknown" };
        } catch {
          return { id: c, raw: n.getItem(u) ?? "", error: "unreadable" };
        }
      });
    }
  };
}
function rh(e = []) {
  const t = new Map(e.map((n) => [n.id, n]));
  return {
    async list() {
      return [...t.values()].map(by).sort((n, r) => r.updatedAt.localeCompare(n.updatedAt));
    },
    async load(n) {
      return t.get(n);
    },
    async loadMany(n) {
      return n.map((r) => t.get(r)).filter((r) => !!r);
    },
    async save(n) {
      t.set(n.id, n);
    },
    async remove(n) {
      t.delete(n);
    },
    async listCorrupt() {
      return [];
    }
  };
}
const $b = `
.tb-app { --tb-selection: #fbbf24; --tb-bg: #1f2937; --tb-chrome: #111827; --tb-chrome-2: #1f2937; --tb-border: #374151; --tb-text: #e5e7eb; --tb-muted: #9ca3af;
  display: flex; flex-direction: column; height: 100%; min-height: 0; box-sizing: border-box;
  background: var(--tb-chrome); color: var(--tb-text); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 16px; line-height: 1.5;
  overflow: hidden; contain: layout paint; }
.tb-app *, .tb-app *::before, .tb-app *::after { box-sizing: border-box; }
/* Same defence as the editor: hosts style bare elements globally. */
.tb-app input, .tb-app select, .tb-app textarea { width: auto; max-width: 100%; }
.tb-app button { font: inherit; padding: 0 12px; min-height: 40px; border-radius: 8px; border: 1px solid #4b5563; background: var(--tb-chrome-2); color: var(--tb-text); cursor: pointer; }
.tb-app button:disabled { opacity: .4; cursor: default; }
.tb-app button:focus-visible, .tb-app input:focus-visible, .tb-app select:focus-visible { outline: 2px solid var(--tb-selection); outline-offset: 2px; }
.tb-app input, .tb-app select { font: inherit; color: var(--tb-text); background: var(--tb-chrome-2); border: 1px solid #4b5563; border-radius: 8px; min-height: 40px; padding: 0 10px; }
.tb-app h1, .tb-app h2 { margin: 0; }
.tb-app .lib, .tb-app .newb { flex: 1; min-height: 0; overflow-y: auto; width: 100%; max-width: 1100px; margin: 0 auto; padding: 16px 20px 40px; }
.tb-app .lib-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.tb-app .lib-title { font-size: 26px; }
.tb-app .lib-sub { margin: 4px 0 0; color: var(--tb-muted); }
.tb-app .lib-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.tb-app .lib-primary { background: var(--tb-selection); color: #111; border-color: var(--tb-selection); font-weight: 700; }
.tb-app .lib-alert { padding: 10px 12px; border-radius: 10px; background: #7f1d1d; margin-bottom: 12px; }
.tb-app .lib-alert-warn { background: #78350f; }
.tb-app .lib-loading { padding: 40px; text-align: center; color: var(--tb-muted); }
.tb-app .lib-empty { text-align: center; padding: 48px 16px; max-width: 480px; margin: 0 auto; }
.tb-app .lib-empty-art { font-size: 56px; margin-bottom: 8px; }
.tb-app .lib-empty h2 { margin: 0 0 6px; }
.tb-app .lib-empty p { color: var(--tb-muted); margin: 0 0 16px; }
.tb-app .lib-empty .lib-actions { justify-content: center; }
.tb-app .lib-filters { display: flex; gap: 6px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.tb-app .lib-filters [role=tab][aria-selected=true] { border-color: var(--tb-selection); background: rgba(251,191,36,.18); font-weight: 700; }
.tb-app .lib-search { margin-left: auto; min-width: 160px; width: 220px; }
.tb-app .lib-none { color: var(--tb-muted); }
.tb-app .lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.tb-app .card { background: var(--tb-chrome-2); border: 1px solid var(--tb-border); border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; position: relative; }
.tb-app .card-preview { display: block; width: 100%; aspect-ratio: 4 / 3; background: #0f172a; border: 0; border-radius: 0; padding: 0; min-height: 0; }
.tb-app .card-preview svg { width: 100%; height: 100%; display: block; }
.tb-app .card-preview-empty { width: 100%; height: 100%; background: linear-gradient(135deg, #1f2937, #0f172a); }
.tb-app .card-body { padding: 10px 12px 8px; display: flex; flex-direction: column; gap: 4px; }
.tb-app .card-name { text-align: left; background: transparent; border: 0; padding: 0; min-height: 0; font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-app .card-body input { min-height: 34px; }
.tb-app .card-meta { display: flex; gap: 10px; font-size: 12px; color: var(--tb-muted); align-items: center; }
.tb-app .card-kind { padding: 1px 8px; border-radius: 999px; font-weight: 600; }
.tb-app .card-kind-tactic { background: rgba(29,78,216,.35); color: #bfdbfe; }
.tb-app .card-kind-drill { background: rgba(245,158,11,.3); color: #fde68a; }
.tb-app .card-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; }
.tb-app .card-actions button { min-height: 36px; min-width: 36px; padding: 0 8px; background: rgba(17,24,39,.85); }
.tb-app .tb-menu { position: relative; }
.tb-app .tb-menu-list { position: absolute; right: 0; top: 100%; margin-top: 4px; background: var(--tb-chrome-2); border: 1px solid #4b5563; border-radius: 10px; padding: 6px; display: flex; flex-direction: column; gap: 4px; min-width: 170px; z-index: 20; box-shadow: 0 8px 24px rgba(0,0,0,.4); }
.tb-app .tb-menu-list button { text-align: left; border-color: transparent; background: transparent; }
.tb-app .tb-menu-list button:hover { border-color: #4b5563; }
.tb-app .tb-menu-list .danger { color: #fca5a5; }
.tb-app .newb-grid { display: grid; grid-template-columns: 280px 1fr; gap: 24px; }
.tb-app .newb-fields { display: flex; flex-direction: column; gap: 14px; }
.tb-app .newb-fields label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--tb-muted); }
.tb-app .newb-fields input, .tb-app .newb-fields select { width: 100%; }
.tb-app .seg { display: flex; gap: 6px; }
.tb-app .seg [role=radio][aria-checked=true] { border-color: var(--tb-selection); background: rgba(251,191,36,.18); font-weight: 700; color: var(--tb-text); }
.tb-app .newb-templates h2 { margin: 0 0 10px; font-size: 16px; }
.tb-app .tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.tb-app .tpl { text-align: left; padding: 0; overflow: hidden; display: flex; flex-direction: column; background: var(--tb-chrome-2); }
.tb-app .tpl[aria-checked=true] { border-color: var(--tb-selection); box-shadow: 0 0 0 2px rgba(251,191,36,.35); }
.tb-app .tpl-preview, .tb-app .tpl-blank { aspect-ratio: 4 / 3; background: #0f172a; display: flex; align-items: center; justify-content: center; color: var(--tb-muted); }
.tb-app .tpl-preview svg { width: 100%; height: 100%; }
.tb-app .tpl-name { padding: 8px 10px 0; font-weight: 700; }
.tb-app .tpl-cat { font-weight: 400; color: var(--tb-muted); font-size: 12px; margin-left: 6px; }
.tb-app .tpl-desc { padding: 2px 10px 10px; font-size: 12px; color: var(--tb-muted); white-space: normal; }
.tb-app .tb-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 100%; padding: 32px; text-align: center; }
.tb-app .tb-error h2 { font-size: 22px; }
.tb-app .tb-error p { color: var(--tb-muted); max-width: 42ch; margin: 0; }
.tb-app .tb-viewonly { font-size: 12px; color: var(--tb-muted); padding: 6px 10px; border-bottom: 1px solid var(--tb-border); }
@media (max-width: 760px) {
  .tb-app .newb-grid { grid-template-columns: 1fr; }
  .tb-app .lib, .tb-app .newb { padding: 12px 12px 32px; }
  .tb-app .lib-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
}
`, oh = "tb-app-styles";
function Ib(e = typeof document < "u" ? document : void 0) {
  if (!e || e.getElementById(oh)) return;
  const t = e.createElement("style");
  t.id = oh, t.textContent = $b, e.head.appendChild(t);
}
function Tb(e) {
  const t = e.scope.club.id === "local";
  try {
    return typeof localStorage > "u" ? rh() : jb(t ? {} : { namespace: e.scope.club.id });
  } catch {
    return rh();
  }
}
function Nb(e) {
  const t = e;
  return typeof t.listCorrupt == "function" && typeof t.loadMany == "function" ? t : {
    ...e,
    async listCorrupt() {
      return [];
    },
    async loadMany(n) {
      return (await Promise.all(n.map((o) => e.load(o)))).filter((o) => !!o);
    }
  };
}
function Ob(e, t) {
  const n = document.createElement("a");
  n.href = URL.createObjectURL(e), n.download = t, n.click(), setTimeout(() => URL.revokeObjectURL(n.href), 1e3);
}
function zb(e, t = {}) {
  if (!e || typeof e != "object" || !("ownerDocument" in e))
    throw new TypeError("TacticsBoard.mount(element, options): element must be a DOM element");
  const n = t.host ?? Sy();
  if (n.contractVersion !== 1)
    throw new Error(`TacticsBoard: unsupported host contract version ${String(n.contractVersion)} (this build speaks 1)`);
  const r = e.ownerDocument;
  Ib(r), Ky(r);
  const o = Nb(t.persistence ?? Tb(n)), s = (t.routing ?? (t.host ? "memory" : "hash")) === "hash", i = t.initialRoute?.boardId ? { view: "board", id: t.initialRoute.boardId, present: !!t.initialRoute.present } : { view: "home" }, a = s ? xb(r.defaultView ?? window) : wb(i, (g) => {
    n.navigation?.setBoardRoute(g.view === "board" ? { boardId: g.id, present: g.present } : {});
  }), l = r.createElement("div");
  l.className = "tb-app", l.setAttribute("data-tactics-board", ""), e.appendChild(l);
  const u = wy(l);
  let c = !0;
  return u.render(
    /* @__PURE__ */ d.jsx($.StrictMode, { children: /* @__PURE__ */ d.jsx(db, { host: n, children: /* @__PURE__ */ d.jsx(_b, { onRetry: () => a.set({ view: "home" }), onExitToHost: n.navigation?.exit.bind(n.navigation), children: /* @__PURE__ */ d.jsx(Sb, { persistence: o, routeSource: a, download: t.onDownload ?? Ob }) }) }) })
  ), {
    element: e,
    get mounted() {
      return c;
    },
    unmount() {
      c && (c = !1, u.unmount(), l.remove());
    }
  };
}
const Ab = "0.8.0", sh = [
  { key: "id:u-hooker", displayName: "Tom Reilly", number: "2", position: "Hooker", active: !0 },
  { key: "id:u-lock", displayName: "Ade Okafor", number: "5", position: "Lock", active: !0 },
  { key: "id:u-flanker", displayName: "Rhys Morgan", number: "7", position: "Flanker", active: !0 },
  { key: "id:u-scrumhalf", displayName: "Callum Beattie", number: "9", position: "Scrum-half", active: !0 },
  { key: "id:u-flyhalf", displayName: "Sam Whitcombe", number: "10", position: "Fly-half", active: !0 },
  { key: "id:u-centre", displayName: "Ieuan Price", number: "12", position: "Centre", active: !0 },
  { key: "id:u-wing", displayName: "Marcus Bell", number: "14", position: "Wing", active: !0 },
  { key: "id:u-fullback", displayName: "Danny Croft", number: "15", position: "Full-back", active: !1 }
], ih = [
  { id: "sess_tue", title: "Tuesday training", date: "2026-09-01" },
  { id: "sess_thu", title: "Thursday training", date: "2026-09-03" }
], ah = [
  { id: "fix_sat", title: "1st XV vs Camborne", date: "2026-09-05" }
], Pb = {
  createBoard: !0,
  editBoard: !0,
  deleteBoard: !0,
  shareToGroup: !0,
  shareToTeam: !0,
  manageClubTemplates: !0,
  attachToSession: !0,
  attachToMatch: !0,
  sendMessage: !0
}, Lb = {
  createBoard: !1,
  editBoard: !1,
  deleteBoard: !1,
  shareToGroup: !1,
  shareToTeam: !1,
  manageClubTemplates: !1,
  attachToSession: !1,
  attachToMatch: !1,
  sendMessage: !1
};
function Fb(e = {}) {
  const t = [], n = /* @__PURE__ */ new Set(), r = (s, i) => {
    const a = { kind: s, detail: i, at: (/* @__PURE__ */ new Date()).toISOString() };
    t.push(a), n.forEach((l) => l(a));
  }, o = {
    contractVersion: ky,
    user: { id: "u-coach", displayName: e.userName ?? "Nick (Head Coach)" },
    scope: {
      club: { id: "club_demo", name: e.clubName ?? "Demo RFC" },
      group: { id: "grp_senior", name: e.groupName ?? "Senior Men" },
      team: { id: "team_1xv", name: e.teamName ?? "1st XV" },
      season: "2026/27"
    },
    capabilities: { ...Pb, ...e.capabilities },
    log: t,
    onLog(s) {
      return n.add(s), () => n.delete(s);
    }
  };
  return e.withSquad !== !1 && (o.squad = {
    async list() {
      return sh;
    },
    async resolve(s) {
      return sh.filter((i) => s.includes(i.key));
    }
  }), e.withAttachments !== !1 && (o.attachments = {
    async listSessions() {
      return ih;
    },
    async listFixtures() {
      return ah;
    },
    async attachToSession(s, i) {
      r("attach-session", `${i.name} (rev ${i.revision}) → ${ih.find((a) => a.id === s)?.title ?? s}`);
    },
    async attachToFixture(s, i) {
      r("attach-match", `${i.name} (rev ${i.revision}) → ${ah.find((a) => a.id === s)?.title ?? s}`);
    },
    async detach(s) {
      r("detach", `${s.boardId} from ${s.kind} ${s.id}`);
    }
  }), e.withSharing !== !1 && (o.sharing = {
    async supports() {
      return { link: !0, png: !1, message: !0 };
    },
    async share(s) {
      const i = s.audience.kind === "message" ? "a message" : `${s.audience.kind} ${s.audience.id}`;
      return r("share", `${s.board.metadata.name} → ${i}`), { url: `https://coacheasier.example/tactics/${s.board.id}` };
    }
  }), o.navigation = {
    exit() {
      r("exit", "returned to the host"), e.onExit?.();
    },
    setBoardRoute(s) {
      r("route", s.boardId ? `board ${s.boardId}${s.present ? " (presenting)" : ""}` : "library");
    },
    openHost(s) {
      r("open-host", `${s.kind} ${s.id}`);
    }
  }, o;
}
export {
  $b as APP_CSS,
  Sb as App,
  Cb as BOARD_PREFIX,
  Eb as CORRUPT_PREFIX,
  _b as ErrorBoundary,
  Pb as FULL_CAPABILITIES,
  ky as HOST_CONTRACT_VERSION,
  db as HostProvider,
  pb as Library,
  ah as MOCK_FIXTURES,
  ih as MOCK_SESSIONS,
  sh as MOCK_SQUAD,
  Rb as NO_CAPABILITIES,
  yb as NewBoard,
  Lb as VIEW_ONLY_CAPABILITIES,
  xb as createHashRouteSource,
  jb as createLocalStoragePersistence,
  rh as createMemoryPersistenceStore,
  wb as createMemoryRouteSource,
  Fb as createMockHost,
  Ib as ensureAppStyles,
  Sy as localHostContext,
  zb as mount,
  gb as parseRoute,
  fb as relativeTime,
  vb as routeToHash,
  Db as useCanEdit,
  vd as useCapabilities,
  gd as useHost,
  kb as useRouteSource,
  Ab as version
};
//# sourceMappingURL=tactics-board.mjs.map
