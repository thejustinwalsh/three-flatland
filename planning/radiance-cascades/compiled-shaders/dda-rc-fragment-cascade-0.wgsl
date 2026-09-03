// Three.js r185 - Node System

// global
diagnostic( off, derivative_uniformity );


// structs

struct OutputStruct {
	@location( 0 ) color: vec4<f32>
};
var<private> output : OutputStruct;

// uniforms
@binding( 1 ) @group( 1 ) var nodeUniform6 : texture_2d<f32>;
@binding( 2 ) @group( 1 ) var nodeUniform7 : texture_2d<f32>;
@binding( 3 ) @group( 1 ) var nodeUniform8_sampler : sampler;
@binding( 4 ) @group( 1 ) var nodeUniform8 : texture_2d<f32>;

struct objectStruct {
	nodeUniform0 : vec2<f32>,
	nodeUniform1 : f32,
	nodeUniform2 : vec2<f32>,
	nodeUniform3 : f32,
	nodeUniform4 : vec2<f32>,
	nodeUniform5 : vec2<f32>,
	nodeUniform9 : f32,
	nodeUniform10 : f32,
	nodeUniform13 : mat4x4<f32>
};
@binding( 0 ) @group( 1 )
var<uniform> object : objectStruct;

// vars
var<private> nodeVar0 : f32;
var<private> nodeVar1 : vec3<f32>;
var<private> nodeVar2 : f32;
var<private> nodeVar3 : f32;
var<private> nodeVar4 : vec2<f32>;
var<private> nodeVar5 : bool;
var<private> nodeVar6 : vec2<f32>;
var<private> nodeVar7 : bool;
var<private> nodeVar8 : f32;
var<private> nodeVar9 : f32;
var<private> nodeVar10 : vec2<f32>;
var<private> nodeVar11 : vec2<f32>;
var<private> nodeVar12 : vec2<f32>;
var<private> nodeVar13 : i32;
var<private> nodeVar14 : i32;
var<private> nodeVar15 : i32;
var<private> nodeVar16 : i32;
var<private> nodeVar17 : vec2<i32>;
var<private> nodeVar18 : f32;
var<private> nodeVar19 : f32;
var<private> nodeVar20 : i32;
var<private> nodeVar21 : i32;
var<private> nodeVar22 : i32;
var<private> nodeVar23 : i32;
var<private> nodeVar24 : i32;
var<private> nodeVar25 : i32;
var<private> nodeVar26 : vec2<i32>;
var<private> nodeVar27 : vec3<f32>;
var<private> nodeVar28 : f32;
var<private> nodeVar29 : f32;
var<private> nodeVar30 : f32;
var<private> nodeVar31 : f32;
var<private> nodeVar32 : f32;
var<private> nodeVar33 : i32;
var<private> nodeVar34 : i32;
var<private> nodeVar35 : i32;
var<private> nodeVar36 : i32;
var<private> nodeVar37 : i32;
var<private> nodeVar38 : i32;
var<private> nodeVar39 : vec4<f32>;
var<private> nodeVar40 : f32;
var<private> nodeVar41 : f32;
var<private> nodeVar42 : f32;
var<private> nodeVar43 : vec4<f32>;
var<private> nodeVar44 : i32;
var<private> nodeVar45 : f32;
var<private> nodeVar46 : i32;
var<private> nodeVar47 : i32;
var<private> nodeVar48 : i32;
var<private> nodeVar49 : i32;
var<private> nodeVar50 : i32;
var<private> nodeVar51 : i32;
var<private> nodeVar52 : vec4<f32>;
var<private> nodeVar53 : f32;
var<private> nodeVar54 : f32;
var<private> nodeVar55 : f32;
var<private> nodeVar56 : i32;
var<private> nodeVar57 : i32;
var<private> nodeVar58 : i32;
var<private> nodeVar59 : i32;
var<private> nodeVar60 : i32;
var<private> nodeVar61 : i32;
var<private> nodeVar62 : vec4<f32>;
var<private> nodeVar63 : f32;
var<private> nodeVar64 : f32;
var<private> nodeVar65 : f32;
var<private> nodeVar66 : vec3<f32>;
var<private> nodeVar67 : vec3<f32>;
var<private> nodeVar68 : vec4<f32>;
var<private> nodeVar69 : vec4<f32>;
var<private> nodeVar70 : vec3<f32>;
var<private> nodeVar71 : vec4<f32>;
var<private> nodeVar72 : f32;
var<private> nodeVar73 : f32;
var<private> nodeVar74 : vec3<f32>;
var<private> nodeVar75 : f32;
var<private> nodeVar76 : vec3<f32>;
var<private> nodeVar77 : f32;
var<private> nodeVar78 : f32;
var<private> nodeVar79 : vec2<f32>;
var<private> nodeVar80 : vec4<f32>;
var<private> nodeVar81 : vec4<f32>;
var<private> nodeVar82 : f32;
var<private> nodeVar83 : vec4<f32>;
var<private> nodeVar84 : vec4<f32>;
var<private> nodeVar85 : f32;
var<private> nodeVar86 : vec4<f32>;
var<private> nodeVar87 : vec4<f32>;
var<private> nodeVar88 : f32;
var<private> nodeVar89 : vec4<f32>;
var<private> nodeVar90 : vec4<f32>;
var<private> nodeVar91 : vec4<f32>;

// codes
fn tsl_mod_vec2( x : vec2f, y : vec2f ) -> vec2f { return x - y * floor( x / y ); }
fn tsl_mod_float( x : f32, y : f32 ) -> f32 { return x - y * floor( x / y ); }


@fragment
fn main( @location( 0 ) nodeVarying4 : vec2<f32> ) -> OutputStruct {

	// flow
	// code

	let rcFragCoord = ( nodeVarying4 * vec2<f32>( 672.0, 416.0 ) );
	let rcProbeGroupSize = vec2<f32>( 168.0, 104.0 );
	let rcRayXY = floor( ( rcFragCoord / rcProbeGroupSize ) );
	let rcProbeXY = tsl_mod_vec2( rcFragCoord, rcProbeGroupSize );
	let rcRayIndex = ( rcRayXY.x + ( rcRayXY.y * 4.0 ) );
	let rcActiveProbeXY = clamp( rcProbeXY, vec2<f32>( 0.5, 0.5 ), vec2<f32>( 167.5, 97.5 ) );
	let rcProbeUV = clamp( ( ( rcActiveProbeXY * vec2<f32>( 1.0 ) ) / vec2<f32>( 168.0, 98.0 ) ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
	let rcProbeLocalPos = ( rcProbeUV * object.nodeUniform0 );
	let rcTheta = ( ( rcRayIndex + 0.5 ) * 0.39269908169872414 );
	let rcRayDirection = vec2<f32>( cos( rcTheta ), sin( rcTheta ) );
	let rcSegmentStartLocal = ( rcProbeLocalPos + ( rcRayDirection * vec2<f32>( object.nodeUniform1 ) ) );
	let rcSegmentStart = ( rcSegmentStartLocal + object.nodeUniform2 );

	if ( ( 0.0 > 0.5 ) ) {

		nodeVar0 = object.nodeUniform3;

	} else {

		nodeVar0 = object.nodeUniform3;

	}

	let rcTraceLimit = nodeVar0;
	nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
	nodeVar2 = 1.0;
	nodeVar3 = 0.0;
	nodeVar5 = ( abs( rcRayDirection.x ) < 0.000001 );
	nodeVar6 = ( object.nodeUniform4 + object.nodeUniform5 );
	nodeVar7 = ( abs( rcRayDirection.y ) < 0.000001 );

	if ( ( ( nodeVar5 && ( ( rcSegmentStart.x < object.nodeUniform4.x ) || ( rcSegmentStart.x > nodeVar6.x ) ) ) || ( nodeVar7 && ( ( rcSegmentStart.y < object.nodeUniform4.y ) || ( rcSegmentStart.y > nodeVar6.y ) ) ) ) ) {

		nodeVar4 = vec2<f32>( 1.0, -1.0 );

	} else {


		if ( nodeVar5 ) {

			nodeVar8 = 0.000001;

		} else {

			nodeVar8 = rcRayDirection.x;

		}


		if ( nodeVar7 ) {

			nodeVar9 = 0.000001;

		} else {

			nodeVar9 = rcRayDirection.y;

		}

		nodeVar10 = ( vec2<f32>( 1.0 ) / vec2<f32>( nodeVar8, nodeVar9 ) );
		nodeVar11 = ( ( object.nodeUniform4 - rcSegmentStart ) * nodeVar10 );
		nodeVar12 = ( ( nodeVar6 - rcSegmentStart ) * nodeVar10 );
		nodeVar4 = vec2<f32>( max( min( nodeVar11.x, nodeVar12.x ), min( nodeVar11.y, nodeVar12.y ) ), min( max( nodeVar11.x, nodeVar12.x ), max( nodeVar11.y, nodeVar12.y ) ) );

	}

	let rcBoundsInterval = nodeVar4;
	let rcTraceEntry = max( rcBoundsInterval.x, 0.0 );
	let rcTraceExit = min( rcBoundsInterval.y, rcTraceLimit );
	let rcIntersectsWorld = ( rcTraceExit >= rcTraceEntry );
	let nodeConst0 = vec2<f32>( 2.0, 2.0 );
	let nodeConst1 = ( rcSegmentStart + ( rcRayDirection * vec2<f32>( rcTraceEntry ) ) );
	let nodeConst2 = clamp( ( ( nodeConst1 - object.nodeUniform4 ) / object.nodeUniform5 ), vec2<f32>( 0.0 ), vec2<f32>( 1.0 ) );
	let nodeConst3 = vec2<f32>( nodeConst2.x, ( 1.0 - nodeConst2.y ) );
	let nodeConst4 = clamp( ( nodeConst3 * nodeConst0 ), vec2<f32>( 0.0, 0.0 ), ( nodeConst0 - vec2<f32>( 0.0001 ) ) );
	let nodeConst5 = vec2<f32>( ( ( rcRayDirection.x / object.nodeUniform5.x ) * nodeConst0.x ), ( ( ( rcRayDirection.y / object.nodeUniform5.y ) * nodeConst0.y ) * -1.0 ) );
	let nodeConst6 = ( abs( nodeConst5.x ) < 1e-8 );
	let nodeConst7 = ( abs( nodeConst5.y ) < 1e-8 );

	if ( nodeConst6 ) {

		nodeVar13 = 0;

	} else {


		if ( ( nodeConst5.x > 0.0 ) ) {

			nodeVar14 = 1;

		} else {

			nodeVar14 = -1;

		}

		nodeVar13 = nodeVar14;

	}


	if ( nodeConst7 ) {

		nodeVar15 = 0;

	} else {


		if ( ( nodeConst5.y > 0.0 ) ) {

			nodeVar16 = 1;

		} else {

			nodeVar16 = -1;

		}

		nodeVar15 = nodeVar16;

	}

	let nodeConst8 = vec2<i32>( nodeVar13, nodeVar15 );
	let nodeConst9 = clamp( ( nodeConst4 + ( vec2<f32>( nodeConst8 ) * vec2<f32>( 0.00001 ) ) ), vec2<f32>( 0.0, 0.0 ), ( nodeConst0 - vec2<f32>( 0.0001 ) ) );
	nodeVar17 = vec2<i32>( i32( floor( nodeConst9.x ) ), i32( floor( nodeConst9.y ) ) );

	if ( ( nodeConst8.x > 0 ) ) {

		nodeVar18 = f32( ( nodeVar17.x + 1 ) );

	} else {

		nodeVar18 = f32( nodeVar17.x );

	}


	if ( ( nodeConst8.y > 0 ) ) {

		nodeVar19 = f32( ( nodeVar17.y + 1 ) );

	} else {

		nodeVar19 = f32( nodeVar17.y );

	}

	let nodeConst10 = vec2<f32>( nodeVar18, nodeVar19 );
	let nodeConst11 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst5.x ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
	let nodeConst12 = i32( floor( ( ( clamp( ( 1.0 / abs( nodeConst5.y ) ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

	if ( ( nodeConst11 < 1 ) ) {

		nodeVar20 = 1;

	} else {

		nodeVar20 = nodeConst11;

	}

	let nodeConst13 = nodeVar20;

	if ( ( nodeConst12 < 1 ) ) {

		nodeVar21 = 1;

	} else {

		nodeVar21 = nodeConst12;

	}

	let nodeConst14 = nodeVar21;

	if ( nodeConst6 ) {

		nodeVar22 = 1073741823;

	} else {

		nodeVar22 = nodeConst13;

	}


	if ( nodeConst7 ) {

		nodeVar23 = 1073741823;

	} else {

		nodeVar23 = nodeConst14;

	}

	let nodeConst15 = vec2<i32>( nodeVar22, nodeVar23 );

	if ( nodeConst6 ) {

		nodeVar24 = 1073741823;

	} else {

		nodeVar24 = i32( floor( ( ( clamp( ( ( nodeConst10.x - nodeConst4.x ) / nodeConst5.x ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

	}


	if ( nodeConst7 ) {

		nodeVar25 = 1073741823;

	} else {

		nodeVar25 = i32( floor( ( ( clamp( ( ( nodeConst10.y - nodeConst4.y ) / nodeConst5.y ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );

	}

	nodeVar26 = vec2<i32>( nodeVar24, nodeVar25 );
	let nodeConst16 = i32( floor( ( ( clamp( max( ( rcTraceExit - rcTraceEntry ), 0.0 ), 0.0, 262143.99975585938 ) * 4096.0 ) + 0.5 ) ) );
	nodeVar27 = vec3<f32>( 0.0, 0.0, 0.0 );

	if ( ( ! rcIntersectsWorld ) ) {

		nodeVar28 = 1.0;

	} else {

		nodeVar28 = 0.0;

	}

	nodeVar29 = nodeVar28;

	if ( rcIntersectsWorld ) {

		nodeVar30 = 1.0;

	} else {

		nodeVar30 = 0.0;

	}

	nodeVar31 = nodeVar30;
	nodeVar32 = 0.0;

	if ( rcIntersectsWorld ) {


		for ( var i : i32 = 0; i < 4; i ++ ) {

			nodeVar34 = ( nodeVar17.x >> 1u );

			if ( ( nodeVar34 < 0 ) ) {

				nodeVar33 = 0;

			} else {


				if ( ( nodeVar34 > 0 ) ) {

					nodeVar35 = 0;

				} else {

					nodeVar35 = nodeVar34;

				}

				nodeVar33 = nodeVar35;

			}

			nodeVar37 = ( nodeVar17.y >> 1u );

			if ( ( nodeVar37 < 0 ) ) {

				nodeVar36 = 0;

			} else {


				if ( ( nodeVar37 > 0 ) ) {

					nodeVar38 = 0;

				} else {

					nodeVar38 = nodeVar37;

				}

				nodeVar36 = nodeVar38;

			}

			let nodeConst17 = vec2<i32>( nodeVar33, nodeVar36 );
			nodeVar39 = textureLoad( nodeUniform6, nodeConst17, u32( 0u ) );
			let nodeConst18 = nodeVar39.xyz;
			let nodeConst19 = u32( floor( ( ( nodeConst18.x * 255.0 ) + 0.5 ) ) );
			let nodeConst20 = u32( floor( ( ( nodeConst18.y * 255.0 ) + 0.5 ) ) );
			let nodeConst21 = u32( floor( ( ( nodeConst18.z * 255.0 ) + 0.5 ) ) );
			let nodeConst22 = u32( ( ( nodeVar17.x & 1 ) + ( ( nodeVar17.y & 1 ) * 2 ) ) );
			let nodeConst23 = ( 1u << nodeConst22 );

			if ( ( ( nodeConst19 & nodeConst23 ) > 0u ) ) {

				nodeVar40 = 1.0;

			} else {

				nodeVar40 = 0.0;

			}


			if ( ( ( nodeConst20 & nodeConst23 ) > 0u ) ) {

				nodeVar41 = 1.0;

			} else {

				nodeVar41 = 0.0;

			}


			if ( ( ( nodeConst21 & nodeConst23 ) > 0u ) ) {

				nodeVar42 = 1.0;

			} else {

				nodeVar42 = 0.0;

			}

			let nodeConst24 = vec3<f32>( nodeVar40, nodeVar41, nodeVar42 );

			if ( ( nodeConst24.z > 0.5 ) ) {

				nodeVar43 = textureLoad( nodeUniform7, nodeVar17, u32( 0u ) );
				let nodeConst25 = nodeVar43.xyz;

				if ( ( dot( nodeConst25, nodeConst25 ) > 1e-10 ) ) {

					nodeVar27 = nodeConst25;
					nodeVar29 = 2.0;
					break;


				}



			}

			let nodeConst26 = ( nodeConst24.x > 0.5 );
			let nodeConst27 = ( nodeConst24.y > 0.5 );

			if ( ( ( nodeVar31 > 0.5 ) && ( ! nodeConst26 ) ) ) {

				nodeVar31 = 0.0;


			}

			let nodeConst28 = ( nodeVar31 < 0.5 );

			if ( ( ( nodeConst28 && ( nodeVar32 > 0.5 ) ) && ( ! nodeConst27 ) ) ) {

				nodeVar29 = -1.0;
				break;


			}


			if ( ( ( nodeConst28 && nodeConst26 ) && ( ! nodeConst27 ) ) ) {

				nodeVar29 = -1.0;
				break;


			}


			if ( ( nodeConst28 && nodeConst27 ) ) {

				nodeVar32 = 1.0;


			}


			if ( ( nodeVar26.x < nodeVar26.y ) ) {

				nodeVar44 = nodeVar26.x;

			} else {

				nodeVar44 = nodeVar26.y;

			}

			let nodeConst29 = nodeVar44;

			if ( ( nodeConst29 >= nodeConst16 ) ) {


				if ( ( nodeVar32 > 0.5 ) ) {

					nodeVar45 = -1.0;

				} else {

					nodeVar45 = 1.0;

				}

				nodeVar29 = nodeVar45;
				break;


			}

			let nodeConst30 = ( abs( ( nodeVar26.x - nodeVar26.y ) ) <= 1 );
			let nodeConst31 = ( ( ! nodeConst30 ) && ( nodeVar26.x < nodeVar26.y ) );
			let nodeConst32 = ( ( ! nodeConst30 ) && ( nodeVar26.y < nodeVar26.x ) );

			if ( nodeConst30 ) {

				let nodeConst33 = vec2<i32>( ( nodeVar17.x + nodeConst8.x ), nodeVar17.y );
				let nodeConst34 = vec2<i32>( nodeVar17.x, ( nodeVar17.y + nodeConst8.y ) );
				nodeVar47 = ( nodeConst33.x >> 1u );

				if ( ( nodeVar47 < 0 ) ) {

					nodeVar46 = 0;

				} else {


					if ( ( nodeVar47 > 0 ) ) {

						nodeVar48 = 0;

					} else {

						nodeVar48 = nodeVar47;

					}

					nodeVar46 = nodeVar48;

				}

				nodeVar50 = ( nodeConst33.y >> 1u );

				if ( ( nodeVar50 < 0 ) ) {

					nodeVar49 = 0;

				} else {


					if ( ( nodeVar50 > 0 ) ) {

						nodeVar51 = 0;

					} else {

						nodeVar51 = nodeVar50;

					}

					nodeVar49 = nodeVar51;

				}

				let nodeConst35 = vec2<i32>( nodeVar46, nodeVar49 );
				nodeVar52 = textureLoad( nodeUniform6, nodeConst35, u32( 0u ) );
				let nodeConst36 = nodeVar52.xyz;
				let nodeConst37 = u32( floor( ( ( nodeConst36.x * 255.0 ) + 0.5 ) ) );
				let nodeConst38 = u32( floor( ( ( nodeConst36.y * 255.0 ) + 0.5 ) ) );
				let nodeConst39 = u32( floor( ( ( nodeConst36.z * 255.0 ) + 0.5 ) ) );
				let nodeConst40 = u32( ( ( nodeConst33.x & 1 ) + ( ( nodeConst33.y & 1 ) * 2 ) ) );
				let nodeConst41 = ( 1u << nodeConst40 );

				if ( ( ( nodeConst37 & nodeConst41 ) > 0u ) ) {

					nodeVar53 = 1.0;

				} else {

					nodeVar53 = 0.0;

				}


				if ( ( ( nodeConst38 & nodeConst41 ) > 0u ) ) {

					nodeVar54 = 1.0;

				} else {

					nodeVar54 = 0.0;

				}


				if ( ( ( nodeConst39 & nodeConst41 ) > 0u ) ) {

					nodeVar55 = 1.0;

				} else {

					nodeVar55 = 0.0;

				}

				let nodeConst42 = vec3<f32>( nodeVar53, nodeVar54, nodeVar55 );
				nodeVar57 = ( nodeConst34.x >> 1u );

				if ( ( nodeVar57 < 0 ) ) {

					nodeVar56 = 0;

				} else {


					if ( ( nodeVar57 > 0 ) ) {

						nodeVar58 = 0;

					} else {

						nodeVar58 = nodeVar57;

					}

					nodeVar56 = nodeVar58;

				}

				nodeVar60 = ( nodeConst34.y >> 1u );

				if ( ( nodeVar60 < 0 ) ) {

					nodeVar59 = 0;

				} else {


					if ( ( nodeVar60 > 0 ) ) {

						nodeVar61 = 0;

					} else {

						nodeVar61 = nodeVar60;

					}

					nodeVar59 = nodeVar61;

				}

				let nodeConst43 = vec2<i32>( nodeVar56, nodeVar59 );
				nodeVar62 = textureLoad( nodeUniform6, nodeConst43, u32( 0u ) );
				let nodeConst44 = nodeVar62.xyz;
				let nodeConst45 = u32( floor( ( ( nodeConst44.x * 255.0 ) + 0.5 ) ) );
				let nodeConst46 = u32( floor( ( ( nodeConst44.y * 255.0 ) + 0.5 ) ) );
				let nodeConst47 = u32( floor( ( ( nodeConst44.z * 255.0 ) + 0.5 ) ) );
				let nodeConst48 = u32( ( ( nodeConst34.x & 1 ) + ( ( nodeConst34.y & 1 ) * 2 ) ) );
				let nodeConst49 = ( 1u << nodeConst48 );

				if ( ( ( nodeConst45 & nodeConst49 ) > 0u ) ) {

					nodeVar63 = 1.0;

				} else {

					nodeVar63 = 0.0;

				}


				if ( ( ( nodeConst46 & nodeConst49 ) > 0u ) ) {

					nodeVar64 = 1.0;

				} else {

					nodeVar64 = 0.0;

				}


				if ( ( ( nodeConst47 & nodeConst49 ) > 0u ) ) {

					nodeVar65 = 1.0;

				} else {

					nodeVar65 = 0.0;

				}

				let nodeConst50 = vec3<f32>( nodeVar63, nodeVar64, nodeVar65 );
				nodeVar66 = vec3<f32>( 0.0, 0.0, 0.0 );
				nodeVar67 = vec3<f32>( 0.0, 0.0, 0.0 );

				if ( ( nodeConst42.z > 0.5 ) ) {

					nodeVar68 = textureLoad( nodeUniform7, nodeConst33, u32( 0u ) );
					let nodeConst51 = nodeVar68.xyz;
					nodeVar66 = nodeConst51;


				}


				if ( ( nodeConst50.z > 0.5 ) ) {

					nodeVar69 = textureLoad( nodeUniform7, nodeConst34, u32( 0u ) );
					let nodeConst52 = nodeVar69.xyz;
					nodeVar67 = nodeConst52;


				}


				if ( ( dot( nodeVar66, nodeVar66 ) > dot( nodeVar67, nodeVar67 ) ) ) {

					nodeVar70 = nodeVar66;

				} else {

					nodeVar70 = nodeVar67;

				}


				if ( ( dot( nodeVar70, nodeVar70 ) > 1e-10 ) ) {

					nodeVar27 = nodeVar70;
					nodeVar29 = 2.0;
					break;


				}

				let nodeConst53 = ( nodeConst42.y > 0.5 );
				let nodeConst54 = ( nodeConst50.y > 0.5 );
				let nodeConst55 = ( ( nodeConst42.x > 0.5 ) && ( ! nodeConst53 ) );
				let nodeConst56 = ( ( nodeConst50.x > 0.5 ) && ( ! nodeConst54 ) );
				let nodeConst57 = ( nodeVar31 < 0.5 );

				if ( ( nodeConst57 && ( nodeConst55 || nodeConst56 ) ) ) {

					nodeVar29 = -1.0;
					break;


				}


				if ( ( nodeConst57 && ( nodeConst53 || nodeConst54 ) ) ) {

					nodeVar32 = 1.0;


				}


				if ( ( ( nodeConst57 && ( nodeVar32 > 0.5 ) ) && ( ! ( nodeConst53 || nodeConst54 ) ) ) ) {

					nodeVar29 = -1.0;
					break;


				}

				nodeVar17.x = ( nodeVar17.x + nodeConst8.x );
				nodeVar17.y = ( nodeVar17.y + nodeConst8.y );
				nodeVar26.x = ( nodeVar26.x + nodeConst15.x );
				nodeVar26.y = ( nodeVar26.y + nodeConst15.y );


			}


			if ( nodeConst31 ) {

				nodeVar17.x = ( nodeVar17.x + nodeConst8.x );
				nodeVar26.x = ( nodeVar26.x + nodeConst15.x );


			}


			if ( nodeConst32 ) {

				nodeVar17.y = ( nodeVar17.y + nodeConst8.y );
				nodeVar26.y = ( nodeVar26.y + nodeConst15.y );


			}


		}



	}

	nodeVar71 = vec4<f32>( nodeVar27, nodeVar29 );
	nodeVar1 = nodeVar71.xyz;

	if ( ( ( nodeVar71.w < -0.5 ) || ( nodeVar71.w > 1.5 ) ) ) {

		nodeVar72 = 0.0;

	} else {

		nodeVar72 = 1.0;

	}

	nodeVar2 = nodeVar72;

	if ( ( ( nodeVar71.w > 0.5 ) && ( nodeVar71.w < 1.5 ) ) ) {

		nodeVar73 = 1.0;

	} else {

		nodeVar73 = 0.0;

	}

	nodeVar3 = nodeVar73;

	if ( ( ( ( nodeVar2 > 0.5 ) && ( nodeVar3 > 0.5 ) ) && ( 0.0 > 0.5 ) ) ) {

		nodeVar1 = vec3<f32>( 0.0, 0.0, 0.0 );
		nodeVar2 = 0.0;


	}

	nodeVar74 = nodeVar1;
	nodeVar75 = nodeVar2;

	if ( ( nodeVar2 > 0.0 ) ) {

		nodeVar76 = vec3<f32>( 0.0, 0.0, 0.0 );
		nodeVar77 = 0.0;
		nodeVar78 = ( ( rcRayIndex * 4.0 ) + 0.0 );
		nodeVar79 = clamp( ( rcProbeXY * vec2<f32>( 0.5 ) ), vec2<f32>( 0.5, 0.5 ), vec2<f32>( 83.5, 48.5 ) );
		nodeVar80 = textureSample( nodeUniform8, nodeUniform8_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar78, 8.0 ), floor( ( nodeVar78 / 8.0 ) ) ) * vec2<f32>( 84.0, 52.0 ) ) + nodeVar79 ) / vec2<f32>( 672.0, 416.0 ) ) );
		nodeVar81 = vec4<f32>( ( nodeVar80.xyz * vec3<f32>( object.nodeUniform9 ) ), nodeVar80.w );
		nodeVar76 = ( nodeVar76 + nodeVar81.xyz );
		nodeVar77 = ( nodeVar77 + nodeVar81.w );
		nodeVar82 = ( ( rcRayIndex * 4.0 ) + 1.0 );
		nodeVar83 = textureSample( nodeUniform8, nodeUniform8_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar82, 8.0 ), floor( ( nodeVar82 / 8.0 ) ) ) * vec2<f32>( 84.0, 52.0 ) ) + nodeVar79 ) / vec2<f32>( 672.0, 416.0 ) ) );
		nodeVar84 = vec4<f32>( ( nodeVar83.xyz * vec3<f32>( object.nodeUniform9 ) ), nodeVar83.w );
		nodeVar76 = ( nodeVar76 + nodeVar84.xyz );
		nodeVar77 = ( nodeVar77 + nodeVar84.w );
		nodeVar85 = ( ( rcRayIndex * 4.0 ) + 2.0 );
		nodeVar86 = textureSample( nodeUniform8, nodeUniform8_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar85, 8.0 ), floor( ( nodeVar85 / 8.0 ) ) ) * vec2<f32>( 84.0, 52.0 ) ) + nodeVar79 ) / vec2<f32>( 672.0, 416.0 ) ) );
		nodeVar87 = vec4<f32>( ( nodeVar86.xyz * vec3<f32>( object.nodeUniform9 ) ), nodeVar86.w );
		nodeVar76 = ( nodeVar76 + nodeVar87.xyz );
		nodeVar77 = ( nodeVar77 + nodeVar87.w );
		nodeVar88 = ( ( rcRayIndex * 4.0 ) + 3.0 );
		nodeVar89 = textureSample( nodeUniform8, nodeUniform8_sampler, ( ( ( vec2<f32>( tsl_mod_float( nodeVar88, 8.0 ), floor( ( nodeVar88 / 8.0 ) ) ) * vec2<f32>( 84.0, 52.0 ) ) + nodeVar79 ) / vec2<f32>( 672.0, 416.0 ) ) );
		nodeVar90 = vec4<f32>( ( nodeVar89.xyz * vec3<f32>( object.nodeUniform9 ) ), nodeVar89.w );
		nodeVar76 = ( nodeVar76 + nodeVar90.xyz );
		nodeVar77 = ( nodeVar77 + nodeVar90.w );
		nodeVar76 = ( nodeVar76 * vec3<f32>( 0.25 ) );
		nodeVar77 = ( nodeVar77 * 0.25 );
		nodeVar74 = ( nodeVar74 + ( vec3<f32>( nodeVar75 ) * nodeVar76 ) );
		nodeVar75 = ( nodeVar75 * nodeVar77 );


	}

	nodeVar91 = vec4<f32>( nodeVar74, nodeVar75 );

	// result

	output.color = vec4<f32>( ( floor( ( ( clamp( ( nodeVar91.xyz / vec3<f32>( object.nodeUniform9 ) ), vec3<f32>( 0.0 ), vec3<f32>( 1.0 ) ) * vec3<f32>( object.nodeUniform10 ) ) + vec3<f32>( 0.5 ) ) ) / vec3<f32>( object.nodeUniform10 ) ), ( floor( ( ( clamp( nodeVar91.w, 0.0, 1.0 ) * object.nodeUniform10 ) + 0.5 ) ) / object.nodeUniform10 ) );

	return output;

}
