package earth.glean.wifidirect;

import android.content.Intent;
import android.net.NetworkInfo;
import android.net.wifi.p2p.WifiP2pConfig;
import android.net.wifi.p2p.WifiP2pDevice;
import android.net.wifi.p2p.WifiP2pInfo;
import android.net.wifi.p2p.WifiP2pManager;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class WifiDirectManager {

    private static final String TAG = "GleanWifiDirect";
    private static final int PORT = 8988;

    private final WifiP2pManager manager;
    private final WifiP2pManager.Channel channel;
    private final WifiDirectPlugin plugin;
    private final ExecutorService executor = Executors.newCachedThreadPool();

    private ServerSocket serverSocket;
    private Socket peerSocket;
    private PrintWriter peerWriter;
    private WifiP2pInfo connectionInfo;
    private boolean isGroupOwner = false;

    WifiDirectManager(WifiP2pManager manager, WifiP2pManager.Channel channel, WifiDirectPlugin plugin) {
        this.manager = manager;
        this.channel = channel;
        this.plugin = plugin;
    }

    void startDiscovery(PluginCall call) {
        manager.discoverPeers(channel, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() {
                JSObject result = new JSObject();
                result.put("supported", true);
                call.resolve(result);
            }
            @Override
            public void onFailure(int reason) {
                call.reject("Discovery failed: " + reasonString(reason));
            }
        });
    }

    void stopDiscovery(PluginCall call) {
        manager.stopPeerDiscovery(channel, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() { call.resolve(); }
            @Override
            public void onFailure(int reason) { call.reject("Stop failed: " + reasonString(reason)); }
        });
    }

    void connect(String address, PluginCall call) {
        WifiP2pConfig config = new WifiP2pConfig();
        config.deviceAddress = address;
        manager.connect(channel, config, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() { call.resolve(); }
            @Override
            public void onFailure(int reason) { call.reject("Connect failed: " + reasonString(reason)); }
        });
    }

    void disconnect(PluginCall call) {
        closeConnections();
        manager.removeGroup(channel, new WifiP2pManager.ActionListener() {
            @Override
            public void onSuccess() { call.resolve(); }
            @Override
            public void onFailure(int reason) { call.reject("Disconnect failed: " + reasonString(reason)); }
        });
    }

    void sendMessage(String message, PluginCall call) {
        if (peerWriter == null) {
            call.reject("Not connected to any peer");
            return;
        }
        executor.execute(() -> {
            try {
                peerWriter.println(message);
                peerWriter.flush();
                call.resolve();
            } catch (Exception e) {
                call.reject("Send failed: " + e.getMessage());
            }
        });
    }

    void getConnectionInfo(PluginCall call) {
        if (connectionInfo == null) {
            call.resolve(new JSObject());
            return;
        }
        JSObject result = new JSObject();
        result.put("connected", connectionInfo.groupFormed);
        result.put("isGroupOwner", connectionInfo.isGroupOwner);
        if (connectionInfo.groupOwnerAddress != null) {
            result.put("groupOwnerAddress", connectionInfo.groupOwnerAddress.getHostAddress());
        }
        call.resolve(result);
    }

    // Handle broadcasts from the BroadcastReceiver in the plugin
    void handleBroadcast(Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        switch (action) {
            case WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION:
                manager.requestPeers(channel, peerList -> {
                    plugin.emitPeersUpdated(peerList.getDeviceList());
                    for (WifiP2pDevice d : peerList.getDeviceList()) {
                        plugin.emitPeerFound(d);
                    }
                });
                break;

            case WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION:
                NetworkInfo networkInfo = intent.getParcelableExtra(WifiP2pManager.EXTRA_NETWORK_INFO);
                if (networkInfo != null && networkInfo.isConnected()) {
                    manager.requestConnectionInfo(channel, info -> {
                        connectionInfo = info;
                        isGroupOwner = info.isGroupOwner;
                        String ownerAddr = info.groupOwnerAddress != null
                            ? info.groupOwnerAddress.getHostAddress() : null;
                        plugin.emitConnectionChanged(true, ownerAddr, isGroupOwner);
                        if (isGroupOwner) {
                            startServer();
                        } else {
                            connectToServer(ownerAddr);
                        }
                    });
                } else {
                    connectionInfo = null;
                    plugin.emitConnectionChanged(false, null, false);
                    closeConnections();
                }
                break;
        }
    }

    private void startServer() {
        executor.execute(() -> {
            try {
                serverSocket = new ServerSocket(PORT);
                while (!serverSocket.isClosed()) {
                    try {
                        Socket client = serverSocket.accept();
                        handlePeerSocket(client, client.getInetAddress().getHostAddress());
                    } catch (IOException e) {
                        if (!serverSocket.isClosed()) Log.w(TAG, "Accept error", e);
                    }
                }
            } catch (IOException e) {
                Log.e(TAG, "Server start error", e);
            }
        });
    }

    private void connectToServer(String serverAddress) {
        executor.execute(() -> {
            // Retry until connected — GO may not be listening yet
            for (int attempt = 0; attempt < 10; attempt++) {
                try {
                    Socket socket = new Socket();
                    socket.connect(new InetSocketAddress(serverAddress, PORT), 2000);
                    peerSocket = socket;
                    peerWriter = new PrintWriter(socket.getOutputStream(), true);
                    handlePeerSocket(socket, serverAddress);
                    return;
                } catch (IOException e) {
                    try { Thread.sleep(500); } catch (InterruptedException ignored) {}
                }
            }
            Log.e(TAG, "Could not connect to group owner at " + serverAddress);
        });
    }

    private void handlePeerSocket(Socket socket, String peerAddress) {
        if (peerSocket == null) {
            peerSocket = socket;
            try {
                peerWriter = new PrintWriter(socket.getOutputStream(), true);
            } catch (IOException e) {
                Log.e(TAG, "Writer init error", e);
                return;
            }
        }
        executor.execute(() -> {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    plugin.emitMessageReceived(line, peerAddress);
                }
            } catch (IOException e) {
                Log.w(TAG, "Peer disconnected: " + peerAddress);
            } finally {
                if (peerSocket == socket) {
                    peerSocket = null;
                    peerWriter = null;
                }
            }
        });
    }

    private void closeConnections() {
        try { if (peerSocket != null) peerSocket.close(); } catch (IOException ignored) {}
        try { if (serverSocket != null) serverSocket.close(); } catch (IOException ignored) {}
        peerSocket = null;
        peerWriter = null;
        serverSocket = null;
    }

    private static String reasonString(int reason) {
        switch (reason) {
            case WifiP2pManager.ERROR: return "ERROR";
            case WifiP2pManager.P2P_UNSUPPORTED: return "P2P_UNSUPPORTED";
            case WifiP2pManager.BUSY: return "BUSY";
            default: return "UNKNOWN(" + reason + ")";
        }
    }
}
