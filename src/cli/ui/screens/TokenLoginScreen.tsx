import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, useApp, useInput, type Key } from "ink";
import { AdminApiClient } from "../../../admin-api.js";
import {
	loadConfig as defaultLoadConfig,
	maskApiKey,
	saveConfig as defaultSaveConfig,
	type Config,
} from "../../../config.js";
import {
	obtainApiKeyFromEnvironment,
	type ObtainApiKeyInput,
	type TokenLoginResult,
} from "../../../services/token-login.js";
import { ScreenFrame } from "../components/ScreenFrame.js";

interface TokenLoginScreenProps {
	onBack: () => void;
	loadConfig?: typeof defaultLoadConfig;
	saveConfig?: typeof defaultSaveConfig;
	readEnvironmentToken?: () => string | undefined;
	obtainApiKey?: (input: ObtainApiKeyInput) => Promise<TokenLoginResult>;
}

export function TokenLoginScreen({
	onBack,
	loadConfig = defaultLoadConfig,
	saveConfig = defaultSaveConfig,
	readEnvironmentToken = () => process.env.ORGM_TOKEN,
	obtainApiKey = obtainApiKeyFromEnvironment,
}: TokenLoginScreenProps) {
	const { exit } = useApp();
	const [config, setConfig] = useState<Config | null>(null);
	const [status, setStatus] = useState<
		"loading" | "ready" | "working" | "done" | "error"
	>("loading");
	const [result, setResult] = useState<TokenLoginResult | null>(null);
	const [message, setMessage] = useState("");
	const [inputReady, setInputReady] = useState(false);
	const statusRef = useRef(status);
	const inputReadyRef = useRef(inputReady);
	const onBackRef = useRef(onBack);
	const exitRef = useRef(exit);
	const handleLoginRef = useRef<() => Promise<void>>(async () => {});
	statusRef.current = status;
	inputReadyRef.current = inputReady;
	onBackRef.current = onBack;
	exitRef.current = exit;

	useEffect(() => {
		let cancelled = false;
		void loadConfig()
			.then((loaded) => {
				if (!cancelled) {
					setConfig(loaded);
					setStatus("ready");
				}
			})
			.catch((error) => {
				if (!cancelled) {
					setMessage(error instanceof Error ? error.message : String(error));
					setStatus("error");
				}
			});
		return () => {
			cancelled = true;
		};
	}, [loadConfig]);

	useEffect(() => {
		if (status !== "ready") {
			setInputReady(false);
			return;
		}
		const timer = setTimeout(() => setInputReady(true), 50);
		return () => clearTimeout(timer);
	}, [status]);

	const handleLogin = async () => {
		if (!config) return;
		setStatus("working");
		try {
			const next = await obtainApiKey({
				config,
				environmentToken: readEnvironmentToken(),
				createClient: (credential) =>
					new AdminApiClient({
						apiBaseUrl: config.apiBaseUrl,
						apiKey: credential,
					}),
			});
			await saveConfig({ ...config, apiKey: next.apiKey });
			setConfig({ ...config, apiKey: next.apiKey });
			setResult(next);
			setStatus("done");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
			setStatus("error");
		}
	};

	handleLoginRef.current = handleLogin;

	const handleInput = useCallback((input: string, key: Key) => {
		if (key.ctrl && input === "c") {
			exitRef.current();
			return;
		}
		if (key.escape && statusRef.current !== "working") {
			onBackRef.current();
			return;
		}
		if (key.return && statusRef.current === "ready" && inputReadyRef.current) {
			void handleLoginRef.current();
		}
	}, []);

	useInput(handleInput);

	if (status === "loading" || status === "working") {
		return (
			<ScreenFrame
				title="Iniciar sesión / Obtener API key"
				help={status === "loading" ? "Cargando..." : "Validando ORGM_TOKEN..."}
			>
				<Text color="yellow">
					{status === "loading"
						? "Cargando configuración..."
						: "Obteniendo API key..."}
				</Text>
			</ScreenFrame>
		);
	}

	if (status === "done" && result) {
		return (
			<ScreenFrame title="API key configurada" help="Esc volver · Ctrl+C salir">
				<Text color="green">Acceso configurado para {result.email}.</Text>
				<Text>API key: {maskApiKey(result.apiKey)}</Text>
				{result.roleName ? <Text>Rol: {result.roleName}</Text> : null}
			</ScreenFrame>
		);
	}

	if (status === "error") {
		return (
			<ScreenFrame
				title="No se pudo obtener API key"
				help="Esc volver · Ctrl+C salir"
			>
				<Text color="red">{message}</Text>
			</ScreenFrame>
		);
	}

	return (
		<ScreenFrame
			title="Iniciar sesión / Obtener API key"
			help={
				inputReady
					? "Enter usar ORGM_TOKEN · Esc volver · Ctrl+C salir"
					: "Preparando acceso..."
			}
		>
			<Text>
				{inputReady
					? "Se reutilizará ORGM_TOKEN configurado para MCP."
					: "Preparando acceso MCP..."}
			</Text>
			<Text>La credencial no se mostrará ni se guardará si es JWT.</Text>
		</ScreenFrame>
	);
}
