﻿using Newtonsoft.Json.Linq;
using System;
using System.Net.WebSockets;
using System.Reflection;

namespace StableUI.WebAPI;

/// <summary>Uses reflection to automatically build an API call route handler.</summary>
public class APICallReflectBuilder
{
    public static Dictionary<Type, Func<JToken, (bool, object)>> TypeCoercerMap = new()
    {
        [typeof(string)] = (JToken input) => (true, input.ToString()),
        [typeof(int)] = (JToken input) => (int.TryParse(input.ToString(), out int output), output),
        [typeof(long)] = (JToken input) => (long.TryParse(input.ToString(), out long output), output),
        [typeof(float)] = (JToken input) => (float.TryParse(input.ToString(), out float output), output),
        [typeof(double)] = (JToken input) => (double.TryParse(input.ToString(), out double output), output),
        [typeof(bool)] = (JToken input) => (bool.TryParse(input.ToString(), out bool output), output),
        [typeof(byte)] = (JToken input) => (byte.TryParse(input.ToString(), out byte output), output),
        [typeof(char)] = (JToken input) => (char.TryParse(input.ToString(), out char output), output),
        [typeof(string[])] = (JToken input) => (true, input.ToList().Select(j => j.ToString()).ToArray())
    };

    public static APICall BuildFor(object obj, MethodInfo method)
    {
        if (method.ReturnType != typeof(Task<JObject>))
        {
            throw new Exception($"Invalid API return type '{method.ReturnType.Name}' for method '{method.DeclaringType.Name}.{method.Name}'");
        }
        APICaller caller = new(obj, method, new());
        bool isWebSocket = false;
        foreach (ParameterInfo param in method.GetParameters())
        {
            if (param.ParameterType == typeof(HttpContext))
            {
                caller.InputMappers.Add((context, _, _) => (null, context));
            }
            else if (param.ParameterType == typeof(JObject))
            {
                caller.InputMappers.Add((_, _, input) => (null, input));
            }
            else if (param.ParameterType == typeof(WebSocket))
            {
                caller.InputMappers.Add((_, socket, _) => (null, socket));
                isWebSocket = true;
            }
            else if (TypeCoercerMap.TryGetValue(param.ParameterType, out Func<JToken, (bool, object)> coercer))
            {
                caller.InputMappers.Add((_, _, input) =>
                {
                    if (!input.TryGetValue(param.Name, out JToken value))
                    {
                        if (param.HasDefaultValue)
                        {
                            return (null, param.DefaultValue);
                        }
                        return ($"Missing required parameter '{param.Name}'", null);
                    }
                    (bool success, object output) = coercer(value);
                    if (!success)
                    {
                        return ($"Invalid value '{value}' for parameter '{param.Name}', must be type '{param.ParameterType.Name}'", null);
                    }
                    return (null, output);
                });
            }
            else
            {
                throw new Exception($"Invalid API parameter type '{param.ParameterType.Name}' for param '{param.Name}' of method '{method.DeclaringType.Name}.{method.Name}'");
            }
        }
        return new APICall(method.Name, caller.Call, isWebSocket);
    }

    public record class APICaller(object Obj, MethodInfo Method, List<Func<HttpContext, WebSocket, JObject, (string, object)>> InputMappers)
    {
        public Task<JObject> Call(HttpContext context, WebSocket socket, JObject input)
        {
            object[] arr = new object[InputMappers.Count];
            for (int i = 0; i < InputMappers.Count; i++)
            {
                (string error, object value) = InputMappers[i](context, socket, input);
                if (error is not null)
                {
                    return Task.FromResult(new JObject() { ["error"] = error });
                }
                arr[i] = value;
            }
            return Method.Invoke(Obj, arr) as Task<JObject>;
        }
    }
}
